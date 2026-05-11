"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";

type UserRole = "sales" | "manager" | "admin";

type AuthContextType = {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
});

function getUserRole(user: User | null): UserRole | null {
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
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = getSupabaseClient();

    if (!client) {
      setUser(null);
      setRole(null);
      setLoading(false);
      return;
    }

    const supabase = client as SupabaseClient;

    async function initializeAuth() {
      const currentUser = await loadCurrentUser(supabase);

      setUser(currentUser);
      setRole(getUserRole(currentUser));
      setLoading(false);
    }

    void initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;

      setUser(currentUser);
      setRole(getUserRole(currentUser));
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}