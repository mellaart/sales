"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabaseClient = getSupabaseClient();

    if (!supabaseClient) {
      setUser(null);
      setRole(null);
      setLoading(false);
      return;
    }

    async function loadUser() {
      const {
        data: { user: currentUser },
      } = await supabaseClient.auth.getUser();

      setUser(currentUser ?? null);
      setRole(getUserRole(currentUser ?? null));
      setLoading(false);
    }

    void loadUser();

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
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