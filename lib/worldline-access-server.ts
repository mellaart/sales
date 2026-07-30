import { ensureProtectedAdminRole } from "@/lib/protected-admin-server";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { getTabPermission, type TabPermission } from "@/lib/role-tabs";
import { readLocalRoleTabAccess, readRoleTabAccess } from "@/lib/role-tab-access-storage";
import type { ServiceClient } from "@/lib/admin-api";
import type { ProfileRecord, UserRole } from "@/lib/supabase";

type RequiredWorldlinePermission = "read" | "write";

function hasRequiredPermission(permission: TabPermission, required: RequiredWorldlinePermission) {
  return required === "write" ? permission === "write" : permission !== "none";
}

export async function getLocalWorldlinePermission(
  profile: Pick<ProfileRecord, "email" | "role">,
) {
  const role = isProtectedAdminEmail(profile.email) ? "admin" : profile.role;
  const roleTabAccess = await readLocalRoleTabAccess();
  return getTabPermission(role, "worldline", roleTabAccess);
}

export async function verifyWorldlineAccess(
  request: Request,
  service: ServiceClient,
  required: RequiredWorldlinePermission,
) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return { ok: false as const, status: 401, message: "Niet ingelogd." };
  }

  const { data: userData, error: userError } = await service.auth.getUser(token);
  if (userError || !userData.user) {
    return { ok: false as const, status: 401, message: "Ongeldige sessie." };
  }

  await ensureProtectedAdminRole(service, userData.user);

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  const protectedAdmin = isProtectedAdminEmail(userData.user.email);
  if (!protectedAdmin && (profileError || !profile)) {
    return { ok: false as const, status: 403, message: "Geen toegang tot Worldline." };
  }

  const role = protectedAdmin
    ? "admin"
    : (((profile as { role?: UserRole } | null)?.role ?? null) as UserRole | null);
  const permission = getTabPermission(role, "worldline", await readRoleTabAccess(service));

  if (!hasRequiredPermission(permission, required)) {
    return {
      ok: false as const,
      status: 403,
      message: required === "write"
        ? "Geen schrijfrechten voor Worldline."
        : "Geen toegang tot Worldline.",
    };
  }

  return {
    ok: true as const,
    userId: userData.user.id,
    email: userData.user.email ?? null,
    role,
    permission,
  };
}
