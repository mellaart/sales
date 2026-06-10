"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
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

const AUTH_REQUEST_TIMEOUT_MS = 3000;
const SESSION_REFRESH_MARGIN_SECONDS = 90;

function fallbackRole(user: User | null): UserRole | null {
  if (!user) return null;
  return getEffectiveUserRole((user.user_metadata?.role as UserRole) || "sales", user.email);
}

function timeout<T>(milliseconds: number, fallback: T) {
  return new Promise<T>((resolve) => {
    setTimeout(() => resolve(fallback), milliseconds);
  });
}

async function withAuthTimeout<T>(promise: Promise<T>, fallback: T) {
  return Promise.race([promise, timeout(AUTH_REQUEST_TIMEOUT_MS, fallback)]);
}

function clearSupabaseAuthStorage() {
  if (typeof window === "undefined") return;

  for (const storage of [window.localStorage, window.sessionStorage]) {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
      (key): key is string => Boolean(key),
    );

    for (const key of keys) {
      if ((key.startsWith("sb-") && key.includes("auth-token")) || key === "supabase.auth.token") {
        storage.removeItem(key);
      }
    }
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  const applyUser = useCallback(async (nextUser: User | null, active = true) => {
    if (!active) return;

    setUser(nextUser);

    if (nextUser) {
      const nextProfile = await fetchProfile(nextUser.id);
      if (!active) return;

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
    const supabase = getSupabaseClient();

    setLoading(true);

    try {
      if (supabase) {
        await withAuthTimeout(supabase.auth.signOut({ scope: "local" }), null);
      }
    } finally {
      clearSupabaseAuthStorage();
      setUser(null);
      setProfile(null);
      setRole(null);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function syncAuthState(showLoading = false) {
      const supabase = getSupabaseClient();

      if (showLoading) {
        setLoading(true);
      }

      if (!supabase) {
        if (active) {
          await applyUser(null, active);
          setLoading(false);
        }
        return;
      }

      try {
        const result = await withAuthTimeout(supabase.auth.getSession(), null);

        if (!active) return;

        let currentSession = result && "data" in result ? result.data.session ?? null : null;
        const expiresAt = currentSession?.expires_at ?? 0;
        const expiresSoon = expiresAt > 0 && expiresAt - Math.floor(Date.now() / 1000) < SESSION_REFRESH_MARGIN_SECONDS;

        if (currentSession && expiresSoon) {
          const refreshResult = await withAuthTimeout(supabase.auth.refreshSession(), null);
          if (!active) return;
          currentSession = refreshResult && "data" in refreshResult ? refreshResult.data.session ?? currentSession : currentSession;
        }

        await applyUser(currentSession?.user ?? null, active);
        setLoading(false);
      } catch {
        if (active) {
          await applyUser(null, active);
          setLoading(false);
        }
      }
    }

    async function initAuth() {
      const supabase = getSupabaseClient();

      await syncAuthState(true);

      if (!supabase || !active) return undefined;

      try {
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, session) => {
          await applyUser(session?.user ?? null, active);
          setLoading(false);
        });

        function handleWindowFocus() {
          void syncAuthState(false);
        }

        function handleVisibilityChange() {
          if (document.visibilityState === "visible") {
            void syncAuthState(false);
          }
        }

        window.addEventListener("focus", handleWindowFocus);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
          subscription.unsubscribe();
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

  return (
    <AuthContext.Provider value={{ user, profile, role, loading, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
