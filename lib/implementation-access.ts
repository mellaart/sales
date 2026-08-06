import { isLocalAdmin, type LocalUser } from "@/lib/local-auth";
import { query } from "@/lib/local-db";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { readLocalRoleTabAccess } from "@/lib/role-tab-access-storage";
import { getTabPermission, type TabPermission } from "@/lib/role-tabs";
import type { ProfileRecord } from "@/lib/supabase";

export type ImplementationActor = {
  user: LocalUser;
  profile: ProfileRecord;
};

export type AccessibleImplementation = {
  id: string;
  deal_id: string;
  customer_name: string;
  created_by: string | null;
  assigned_consultant_id: string | null;
};

async function implementationPermission(actor: ImplementationActor): Promise<TabPermission> {
  if (isProtectedAdminEmail(actor.user.email)) return "write";

  const roleTabAccess = await readLocalRoleTabAccess();
  return getTabPermission(actor.profile.role, "implementation", roleTabAccess);
}

function implementationIsVisible(
  implementation: AccessibleImplementation,
  actor: ImplementationActor,
) {
  if (isLocalAdmin(actor.profile) || actor.profile.role === "manager") return true;
  if (actor.profile.role === "consultant") {
    return implementation.assigned_consultant_id === actor.user.id;
  }
  return implementation.created_by === actor.user.id;
}

export async function requireImplementationAccess(
  implementationId: string,
  actor: ImplementationActor,
  mode: "read" | "write" = "read",
) {
  const permission = await implementationPermission(actor);
  if (permission === "none") {
    return { ok: false as const, status: 403, error: "Geen toegang tot Implementatie." };
  }
  if (mode === "write" && permission !== "write") {
    return {
      ok: false as const,
      status: 403,
      error: "Je hebt alleen leesrechten voor Implementatie.",
    };
  }

  const { rows } = await query<AccessibleImplementation>(
    `select id, deal_id, customer_name, created_by, assigned_consultant_id
     from public.implementations
     where id = $1
     limit 1`,
    [implementationId],
  );
  const implementation = rows[0];

  if (!implementation || !implementationIsVisible(implementation, actor)) {
    return {
      ok: false as const,
      status: 404,
      error: "Implementatie niet gevonden of niet toegankelijk.",
    };
  }

  return { ok: true as const, implementation, permission };
}
