import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getEffectiveUserRole, getProtectedAdminProfile, isProtectedAdminEmail } from "@/lib/protected-admin";
import { ensureProtectedAdminRole } from "@/lib/protected-admin-server";
import { createLocalServiceClient } from "@/lib/local-service-client";
import type { UserRole } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AUTH_METADATA_TIMEOUT_MS = 2000;

function isMissingColumnError(message: string, column: string) {
  return (
    message.includes(`Could not find the '${column}' column of 'profiles' in the schema cache`) ||
    message.includes(`profiles.${column} does not exist`) ||
    message.includes(`column profiles.${column} does not exist`)
  );
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return createLocalServiceClient() as unknown as ReturnType<typeof createClient>;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return createLocalServiceClient() as unknown as ReturnType<typeof createClient>;

  return createClient(url, anonKey);
}

function getSessionClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return createLocalServiceClient() as unknown as ReturnType<typeof createClient>;

  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

type SupabaseClient = NonNullable<ReturnType<typeof getAnonClient>>;

async function verifyAdmin(request: Request) {
  const service = getServiceClient();
  const anon = getAnonClient();

  if (!anon) {
    return { ok: false as const, message: "Server configuratie ontbreekt." };
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return { ok: false as const, message: "Geen token ontvangen." };
  }

  const { data: userData, error: userError } = await anon.auth.getUser(token);

  if (userError || !userData.user) {
    return { ok: false as const, message: "Ongeldige sessie." };
  }

  const sessionClient = getSessionClient(token);

  if (!sessionClient) {
    return { ok: false as const, message: "Server configuratie ontbreekt." };
  }

  if (service) {
    await ensureProtectedAdminRole(service, userData.user);
  }

  const profileClient = service ?? sessionClient;
  const { data: profile, error: profileError } = await profileClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!isProtectedAdminEmail(userData.user.email) && (profileError || !profile || profile.role !== "admin")) {
    return { ok: false as const, message: "Alleen admins hebben toegang." };
  }

  return { ok: true as const, service, sessionClient };
}

type AuthMetadata = {
  email: string | null;
  fullName: string | null;
  jobTitle: string | null;
  workdays: string | null;
  mobilePhone: string | null;
};

async function loadAuthMetadata(
  service: NonNullable<ReturnType<typeof getServiceClient>>,
  profileRows: unknown[],
) {
  const metadataEntries = await Promise.all(
    profileRows.map(async (profileRow) => {
      const profile = profileRow as { id?: string | null };
      if (!profile.id) return null;

      try {
        const result = await Promise.race([
          service.auth.admin.getUserById(profile.id),
          new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), AUTH_METADATA_TIMEOUT_MS);
          }),
        ]);

        if (!result) return null;

        const { data, error } = result;
        if (error || !data.user) return null;

        const metadata = data.user.user_metadata ?? {};
        const fullName =
          normalizeText(metadata.full_name) ??
          normalizeText(metadata.display_name) ??
          normalizeText(metadata.name);

        return [
          profile.id,
          {
            email: normalizeText(data.user.email),
            fullName,
            jobTitle: normalizeText(metadata.job_title),
            workdays: normalizeText(metadata.workdays),
            mobilePhone: normalizeText(metadata.mobile_phone),
          },
        ] as [string, AuthMetadata];
      } catch {
        return null;
      }
    }),
  );

  return new Map(
    metadataEntries.filter((entry): entry is [string, AuthMetadata] => entry !== null),
  );
}

async function loadProfiles(client: SupabaseClient) {
  const profileSelects = [
    "id,role,full_name,job_title,workdays,mobile_phone,email,created_at",
    "id,role,full_name,job_title,workdays,mobile_phone,email",
    "id,role,full_name,email,created_at",
    "id,role,email",
  ];

  let profileRows: unknown[] | null = null;
  let profileError: { message: string } | null = null;

  for (const selectFields of profileSelects) {
    const result = await client.from("profiles").select(selectFields).order("email", { ascending: true });

    if (!result.error) {
      profileRows = result.data ?? [];
      profileError = null;
      break;
    }

    const isSchemaError =
      isMissingColumnError(result.error.message, "full_name") ||
      isMissingColumnError(result.error.message, "job_title") ||
      isMissingColumnError(result.error.message, "workdays") ||
      isMissingColumnError(result.error.message, "mobile_phone") ||
      isMissingColumnError(result.error.message, "created_at");

    if (!isSchemaError) {
      profileError = result.error;
      break;
    }

    profileError = result.error;
  }

  if (profileError && !profileRows) {
    throw new Error(profileError.message);
  }

  return profileRows ?? [];
}

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  try {
    const verified = await verifyAdmin(request);
    if (!verified.ok) {
      return jsonResponse({ error: verified.message }, 401);
    }

    const rows = await loadProfiles(verified.service);
    const authMetadataById = await loadAuthMetadata(verified.service, rows);

    const users = rows.map((profileRow) => {
      const profile = profileRow as {
        id: string;
        role?: UserRole;
        full_name?: string | null;
        job_title?: string | null;
        workdays?: string | null;
        mobile_phone?: string | null;
        email?: string | null;
        created_at?: string | null;
      };

      const authMetadata = authMetadataById.get(profile.id);
      const email = authMetadata?.email ?? normalizeText(profile.email) ?? null;
      const protectedProfile = getProtectedAdminProfile(email);
      const fullName =
        protectedProfile?.fullName ??
        authMetadata?.fullName ??
        normalizeText(profile.full_name) ??
        (email ? email.split("@")[0] : null);

      return {
        id: profile.id,
        email,
        full_name: fullName,
        job_title: protectedProfile?.jobTitle ?? normalizeText(profile.job_title) ?? authMetadata?.jobTitle ?? null,
        workdays: protectedProfile?.workdays ?? normalizeText(profile.workdays) ?? authMetadata?.workdays ?? null,
        mobile_phone: protectedProfile?.mobilePhone ?? normalizeText(profile.mobile_phone) ?? authMetadata?.mobilePhone ?? null,
        role: getEffectiveUserRole(profile.role ?? "sales", email) ?? "sales",
        created_at: profile.created_at ?? null,
        updated_at: null,
      };
    });

    return jsonResponse({ users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout";
    return jsonResponse({ error: message }, 500);
  }
}
