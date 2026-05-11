"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient, type UserRole } from "@/lib/supabase";

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

function getRole(user: User | null): UserRole | null {
  if (!user) return null;
  return (user.user_metadata?.role as UserRole) || "admin";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const supabase = getSupabaseClient();

        if (!supabase) {
          if (mounted) {
            setUser(null);
            setRole(null);
            setLoading(false);
          }
          return;
        }

        const { data } = await supabase.auth.getSession();
        const currentUser = data.session?.user ?? null;

        if (mounted) {
          setUser(currentUser);
          setRole(getRole(currentUser));
          setLoading(false);
        }

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
          const nextUser = session?.user ?? null;
          setUser(nextUser);
          setRole(getRole(nextUser));
          setLoading(false);
        });

        return () => subscription.unsubscribe();
      } catch {
        if (mounted) {
          setUser(null);
          setRole(null);
          setLoading(false);
        }
      }
    }

    const cleanupPromise = init();

    return () => {
      mounted = false;
      void cleanupPromise.then((cleanup) => cleanup?.());
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