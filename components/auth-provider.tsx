"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { fetchProfile, getSupabaseClient, type ProfileRecord, type UserRole } from "@/lib/supabase";

type AuthContextType = {
  user: User | null;
  profile: ProfileRecord | null;
  role: UserRole | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  role: null,
  loading: true,
  refreshProfile: async () => {},
});

function fallbackRole(user: User | null): UserRole | null {
  if (!user) return null;
  return (user.user_metadata?.role as UserRole) || "admin";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshProfile() {
    if (!user) return;

    const nextProfile = await fetchProfile(user.id);

    setProfile(nextProfile);
    setRole(nextProfile?.role ?? fallbackRole(user));
  }

  useEffect(() => {
    let active = true;

    async function initAuth() {
      const supabase = getSupabaseClient();

      if (!supabase) {
        if (active) {
          setUser(null);
          setProfile(null);
          setRole(null);
          setLoading(false);
        }
        return;
      }

      try {
        const timeout = new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 2500);
        });

        const sessionPromise = supabase.auth.getSession();

        const result = await Promise.race([sessionPromise, timeout]);

        if (!active) return;

        const currentUser =
          result && "data" in result ? result.data.session?.user ?? null : null;

        setUser(currentUser);

        if (currentUser) {
          const nextProfile = await fetchProfile(currentUser.id);
          if (!active) return;

          setProfile(nextProfile);
          setRole(nextProfile?.role ?? fallbackRole(currentUser));
        } else {
          setProfile(null);
          setRole(null);
        }

        setLoading(false);

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, session) => {
          const nextUser = session?.user ?? null;

          setUser(nextUser);

          if (nextUser) {
            const nextProfile = await fetchProfile(nextUser.id);
            setProfile(nextProfile);
            setRole(nextProfile?.role ?? fallbackRole(nextUser));
          } else {
            setProfile(null);
            setRole(null);
          }

          setLoading(false);
        });

        return () => subscription.unsubscribe();
      } catch {
        if (active) {
          setUser(null);
          setProfile(null);
          setRole(null);
          setLoading(false);
        }
      }
    }

    const cleanupPromise = initAuth();

    return () => {
      active = false;
      void cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, role, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}