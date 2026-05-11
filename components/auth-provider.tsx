"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
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

function getFallbackRole(user: User | null): UserRole | null {
  if (!user) return null;
  return (user.user_metadata?.role as UserRole) || "admin";
}

async function loadCurrentUser(client: SupabaseClient) {
  const {
    data: { user },
  } = await client.auth.getUser();

  return user ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshProfileForUser(targetUser?: User | null) {
    const currentUser = targetUser ?? user;

    if (!currentUser) {
      setProfile(null);
      setRole(null);
      return;
    }

    const nextProfile = await fetchProfile(currentUser.id);

    setProfile(nextProfile);
    setRole(nextProfile?.role ?? getFallbackRole(currentUser));
  }

  useEffect(() => {
    let mounted = true;

    const client = getSupabaseClient();

    if (!client) {
      setUser(null);
      setProfile(null);
      setRole(null);
      setLoading(false);
      return;
    }

    const supabase = client as SupabaseClient;

    async function initializeAuth() {
      const currentUser = await loadCurrentUser(supabase);

      if (!mounted) return;

      setUser(currentUser);

      if (currentUser) {
        const nextProfile = await fetchProfile(currentUser.id);

        if (!mounted) return;

        setProfile(nextProfile);
        setRole(nextProfile?.role ?? getFallbackRole(currentUser));
      } else {
        setProfile(null);
        setRole(null);
      }

      setLoading(false);
    }

    void initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;

      setUser(currentUser);

      if (currentUser) {
        const nextProfile = await fetchProfile(currentUser.id);
        setProfile(nextProfile);
        setRole(nextProfile?.role ?? getFallbackRole(currentUser));
      } else {
        setProfile(null);
        setRole(null);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        loading,
        refreshProfile: async () => {
          await refreshProfileForUser();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}