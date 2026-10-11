"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { LOCAL_AUTH_TOKEN_KEY } from "@/lib/local-auth-shared";
import { getEffectiveUserRole } from "@/lib/protected-admin";
import { fetchProfile, getSupabaseClient, type ProfileRecord, type UserRole } from "@/lib/supabase";

type AuthContextType = {
  user: User | null;
  profile: ProfileRecord | null;
  role: UserRole | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  role: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
});

const AUTH_REQUEST_TIMEOUT_MS = 10000;
const SESSION_REFRESH_MARGIN_SECONDS = 90;
const AUTH_TIMEOUT_RESULT = { timedOut: true } as const;
const IDLE_LOGOUT_MS = 10 * 60 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 15 * 1000;
const LAST_ACTIVITY_STORAGE_KEY = "smarttrade-last-activity-at";

function fallbackRole(user: User | null): UserRole | null {
  if (!user) return null;
  return getEffectiveUserRole((user.user_metadata?.role as UserRole) || "sales", user.email);
}

async function withAuthTimeout<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<typeof AUTH_TIMEOUT_RESULT>((resolve) => {
        timer = setTimeout(() => resolve(AUTH_TIMEOUT_RESULT), AUTH_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function isAuthTimeout<T>(value: T | typeof AUTH_TIMEOUT_RESULT): value is typeof AUTH_TIMEOUT_RESULT {
  return value === AUTH_TIMEOUT_RESULT;
}

function clearSupabaseAuthStorage() {
  if (typeof window === "undefined") return;

  for (const storageName of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = window[storageName];
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
        (key): key is string => Boolean(key),
      );

      for (const key of keys) {
        if ((key.startsWith("sb-") && key.includes("auth-token")) || key === "supabase.auth.token" || key === LOCAL_AUTH_TOKEN_KEY) {
          storage.removeItem(key);
        }
      }
    } catch {
      // Storage can be unavailable; React auth state must still be cleared.
    }
  }
}

function getLastActivityAt() {
  if (typeof window === "undefined") return Date.now();

  try {
    const storedValue = Number(window.localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY));
    return Number.isFinite(storedValue) && storedValue > 0 ? storedValue : Date.now();
  } catch {
    return Date.now();
  }
}

function setLastActivityAt(value = Date.now()) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(value));
  } catch {
    // Server-side session expiry remains authoritative without browser storage.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const userRef = useRef<User | null>(null);
  const idleLogoutInProgressRef = useRef(false);
  const lastActivityWriteRef = useRef(0);
  const authRevisionRef = useRef(0);
  const signingOutRef = useRef(false);

  const applyUser = useCallback(async (nextUser: User | null, active = true) => {
    if (!active || (nextUser && signingOutRef.current)) return;
    const revision = ++authRevisionRef.current;

    userRef.current = nextUser;
    setUser(nextUser);

    if (nextUser) {
      const result = await withAuthTimeout(fetchProfile(nextUser.id)).catch(() => null);
      const nextProfile = isAuthTimeout(result) ? null : result;
      if (!active || revision !== authRevisionRef.current) return;

      const nextRole = getEffectiveUserRole(nextProfile?.role ?? fallbackRole(nextUser), nextUser.email ?? nextProfile?.email);
      setProfile(nextProfile && nextRole ? { ...nextProfile, role: nextRole } : nextProfile);
      setRole(nextRole);
    } else {
      setProfile(null);
      setRole(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;

    const nextProfile = await fetchProfile(user.id);

    const nextRole = getEffectiveUserRole(nextProfile?.role ?? fallbackRole(user), user.email ?? nextProfile?.email);
    setProfile(nextProfile && nextRole ? { ...nextProfile, role: nextRole } : nextProfile);
    setRole(nextRole);
  }, [user]);

  const signOut = useCallback(async () => {
    signingOutRef.current = true;
    ++authRevisionRef.current;
    setLoading(true);

    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        await withAuthTimeout(supabase.auth.signOut({ scope: "local" }));
      }
    } catch {
      // A failed logout request must not prevent returning to the login page.
    } finally {
      clearSupabaseAuthStorage();
      userRef.current = null;
      setUser(null);
      setProfile(null);
      setRole(null);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let syncing = false;

    async function syncAuthState(showLoading = false) {
      if (syncing || signingOutRef.current) return;
      syncing = true;
      const revision = authRevisionRef.current;
      if (showLoading) {
        setLoading(true);
      }

      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          if (active) {
            await applyUser(null, active);
            setLoading(false);
          }
          return;
        }

        const result = await withAuthTimeout(supabase.auth.getSession());

        if (!active || signingOutRef.current || revision !== authRevisionRef.current) return;

        if (isAuthTimeout(result)) {
          setLoading(false);
          return;
        }

        let currentSession = result && "data" in result ? result.data.session ?? null : null;
        const expiresAt = currentSession?.expires_at ?? 0;
        const expiresSoon = expiresAt > 0 && expiresAt - Math.floor(Date.now() / 1000) < SESSION_REFRESH_MARGIN_SECONDS;

        if (currentSession && expiresSoon) {
          const refreshResult = await withAuthTimeout(supabase.auth.refreshSession());
          if (!active || signingOutRef.current || revision !== authRevisionRef.current) return;
          if (!isAuthTimeout(refreshResult)) {
            currentSession = refreshResult && "data" in refreshResult ? refreshResult.data.session ?? null : currentSession;
          }
        }

        await applyUser(currentSession?.user ?? null, active);
        setLoading(false);
      } catch {
        if (active && !signingOutRef.current && revision === authRevisionRef.current) {
          if (!userRef.current) {
            await applyUser(null, active);
          }
          setLoading(false);
        }
      } finally {
        syncing = false;
      }
    }

    async function initAuth() {
      await syncAuthState(true);

      if (!active) return undefined;

      try {
        const supabase = getSupabaseClient();
        if (!supabase) return undefined;
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
          if (!active) return;
          if (event === "SIGNED_IN") signingOutRef.current = false;

          // Do not await another auth-backed request inside the auth callback.
          setTimeout(() => {
            if (!active) return;
            void applyUser(session?.user ?? null, active).finally(() => {
              if (active) setLoading(false);
            });
          }, 0);
        });

        function handleWindowFocus() {
          void syncAuthState(false);
        }

        function handleVisibilityChange() {
          if (document.visibilityState === "visible") {
            void syncAuthState(false);
          }
        }

        function handlePageShow(event: PageTransitionEvent) {
          if (event.persisted) void syncAuthState(false);
        }

        window.addEventListener("pageshow", handlePageShow);
        window.addEventListener("focus", handleWindowFocus);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
          subscription.unsubscribe();
          window.removeEventListener("pageshow", handlePageShow);
          window.removeEventListener("focus", handleWindowFocus);
          document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
      } catch {
        if (active) {
          await applyUser(null, active);
          setLoading(false);
        }
      }
    }

    const cleanupPromise = initAuth();

    return () => {
      active = false;
      void cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, [applyUser]);

  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      idleLogoutInProgressRef.current = false;
      return;
    }

    idleLogoutInProgressRef.current = false;
    setLastActivityAt();

    function recordActivity() {
      const now = Date.now();
      if (now - lastActivityWriteRef.current < 1000) return;

      lastActivityWriteRef.current = now;
      setLastActivityAt(now);
    }

    async function logoutAfterIdle() {
      if (idleLogoutInProgressRef.current) return;

      idleLogoutInProgressRef.current = true;
      await signOut();

      if (window.location.pathname !== "/login") {
        window.location.replace("/login?timeout=1");
      }
    }

    function checkIdleTime() {
      if (Date.now() - getLastActivityAt() >= IDLE_LOGOUT_MS) {
        void logoutAfterIdle();
      }
    }

    function handleWindowFocus() {
      checkIdleTime();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        checkIdleTime();
      }
    }

    const activityEvents: Array<keyof WindowEventMap> = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "pointerdown"];
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { passive: true });
    });
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const intervalId = window.setInterval(checkIdleTime, IDLE_CHECK_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [signOut, userId]);

  return (
    <AuthContext.Provider value={{ user, profile, role, loading, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
