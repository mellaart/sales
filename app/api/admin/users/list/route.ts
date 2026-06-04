import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isMissingColumnError(message: string, column: "full_name" | "created_at") {
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

  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  return createClient(url, anonKey);
}

function getSessionClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

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

  const profileClient = service ?? sessionClient;
  const { data: profile, error: profileError } = await profileClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "admin") {
    return { ok: false as const, message: "Alleen admins hebben toegang." };
  }

  return { ok: true as const, service, sessionClient };
}

type AuthMetadata = {
  email: string | null;
  fullName: string | null;
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
        const { data, error } = await service.auth.admin.getUserById(profile.id);
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
    "id,role,full_name,email,created_at",
    "id,role,email,created_at",
    "id,role,full_name,email",
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

    const profileClient = verified.service ?? verified.sessionClient;
    const rows = await loadProfiles(profileClient);
    const rowsMissingEmail = rows.filter((profileRow) => {
      const profile = profileRow as { email?: string | null };
      return !normalizeText(profile.email);
    });
    const authMetadataById = verified.service
      ? await loadAuthMetadata(verified.service, rowsMissingEmail)
      : new Map<string, AuthMetadata>();

    const users = rows.map((profileRow) => {
      const profile = profileRow as {
        id: string;
        role?: UserRole;
        full_name?: string | null;
        email?: string | null;
        created_at?: string | null;
      };

      const authMetadata = authMetadataById.get(profile.id);
      const email = normalizeText(profile.email) ?? authMetadata?.email ?? null;
      const fullName =
        normalizeText(profile.full_name) ??
        authMetadata?.fullName ??
        (email ? email.split("@")[0] : null);

      return {
        id: profile.id,
        email,
        full_name: fullName,
        role: profile.role ?? "sales",
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
