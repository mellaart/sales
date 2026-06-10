import { isProtectedAdminEmail } from "@/lib/protected-admin";

type ProtectedAuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

type ProtectedAdminService = {
  from: (table: string) => {
    upsert: (
      values: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => PromiseLike<{ error: { message: string } | null }>;
  };
  auth: {
    admin: {
      updateUserById: (
        userId: string,
        values: { user_metadata: Record<string, unknown> },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
};

export async function ensureProtectedAdminRole(service: ProtectedAdminService, user: ProtectedAuthUser) {
  if (!isProtectedAdminEmail(user.email)) return;

  await service.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? null,
      role: "admin",
    },
    { onConflict: "id" },
  );

  await service.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata ?? {}),
      role: "admin",
    },
  });
}
