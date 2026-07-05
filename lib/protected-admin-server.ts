import { getProtectedAdminProfile, isProtectedAdminEmail } from "@/lib/protected-admin";

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

  const protectedProfile = getProtectedAdminProfile(user.email);

  await service.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? null,
      full_name: protectedProfile?.fullName ?? null,
      job_title: protectedProfile?.jobTitle ?? null,
      workdays: protectedProfile?.workdays ?? null,
      mobile_phone: protectedProfile?.mobilePhone ?? null,
      role: "admin",
    },
    { onConflict: "id" },
  );

  await service.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata ?? {}),
      full_name: protectedProfile?.fullName,
      display_name: protectedProfile?.fullName,
      name: protectedProfile?.fullName,
      job_title: protectedProfile?.jobTitle,
      workdays: protectedProfile?.workdays,
      mobile_phone: protectedProfile?.mobilePhone,
      role: "admin",
    },
  });
}
