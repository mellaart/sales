"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { fetchProfile, getSupabaseClient, type ProfileRecord, type UserRole } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: ProfileRecord | null;
  role: UserRole | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  profile: null,
  role: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async (userId?: string | null) => {
    const targetId = userId ?? user?.id;
    if (!targetId) {
      setProfile(null);
      return;
    }

    try {
      const nextProfile = await fetchProfile(targetId);
      setProfile(nextProfile);
    } catch (error) {
      console.error("Profile fetch failed", error);
      setProfile(null);
    }
  };

  useEffect(() => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const nextSession = data.session ?? null;

        if (!mounted) return;

        setSession(nextSession);
        setUser(nextSession?.user ?? null);

        if (nextSession?.user) {
          await refreshProfile(nextSession.user.id);
        } else {
          setProfile(null);
        }
      } catch (error) {
        console.error("Auth init error", error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    init();

    const { data } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        await refreshProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      session,
      profile,
      role: profile?.role ?? null,
      loading,
      refreshProfile: async () => {
        await refreshProfile();
      },
      signOut: async () => {
        const supabase = getSupabaseClient();
        if (!supabase) return;
        await supabase.auth.signOut();
      },
    }),
    [loading, profile, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}