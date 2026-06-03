import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ROLE_TAB_ACCESS, normalizeRoleTabAccess } from "@/lib/role-tabs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SETTINGS_BUCKET = "smart-trade-settings";
const SETTINGS_FILE = "role-tab-access.json";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type ServiceClient = NonNullable<ReturnType<typeof getServiceClient>>;

async function verifyAdmin(request: Request, service: ServiceClient) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return { ok: false as const, message: "Niet ingelogd." };

  const { data: userData, error: userError } = await service.auth.getUser(token);

  if (userError || !userData.user) {
    return { ok: false as const, message: "Ongeldige sessie." };
  }

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "admin") {
    return { ok: false as const, message: "Geen toegang." };
  }

  return { ok: true as const };
}

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function extractRoleTabAccess(payload: unknown) {
  if (payload && typeof payload === "object" && "roleTabAccess" in payload) {
    return normalizeRoleTabAccess((payload as { roleTabAccess?: unknown }).roleTabAccess);
  }

  return normalizeRoleTabAccess(payload);
}

async function readStoredRoleTabAccess(service: ServiceClient | null) {
  if (!service) {
    return { roleTabAccess: ROLE_TAB_ACCESS, persisted: false, storageReady: false };
  }

  const { data, error } = await service.storage.from(SETTINGS_BUCKET).download(SETTINGS_FILE);

  if (error || !data) {
    return { roleTabAccess: ROLE_TAB_ACCESS, persisted: false, storageReady: true };
  }

  try {
    const parsed = JSON.parse(await data.text()) as unknown;
    return { roleTabAccess: extractRoleTabAccess(parsed), persisted: true, storageReady: true };
  } catch {
    return { roleTabAccess: ROLE_TAB_ACCESS, persisted: false, storageReady: true };
  }
}

async function ensureSettingsBucket(service: ServiceClient) {
  const { error: existingBucketError } = await service.storage.getBucket(SETTINGS_BUCKET);

  if (!existingBucketError) return;

  const { error: createBucketError } = await service.storage.createBucket(SETTINGS_BUCKET, {
    public: false,
  });

  if (createBucketError && !createBucketError.message.toLowerCase().includes("already")) {
    throw new Error(createBucketError.message);
  }
}

export async function GET() {
  const service = getServiceClient();
  const result = await readStoredRoleTabAccess(service);

  return jsonResponse(result);
}

export async function POST(request: Request) {
  try {
    const service = getServiceClient();

    if (!service) {
      return jsonResponse({ error: "Server configuratie ontbreekt." }, 500);
    }

    const verified = await verifyAdmin(request, service);
    if (!verified.ok) {
      return jsonResponse({ error: verified.message }, 403);
    }

    const body = (await request.json().catch(() => null)) as { roleTabAccess?: unknown } | null;
    const roleTabAccess = normalizeRoleTabAccess(body?.roleTabAccess);
    const updatedAt = new Date().toISOString();

    await ensureSettingsBucket(service);

    const payload = Buffer.from(
      JSON.stringify(
        {
          roleTabAccess,
          updatedAt,
        },
        null,
        2,
      ),
      "utf-8",
    );

    const { error: uploadError } = await service.storage.from(SETTINGS_BUCKET).upload(SETTINGS_FILE, payload, {
      contentType: "application/json",
      upsert: true,
    });

    if (uploadError) {
      return jsonResponse({ error: uploadError.message }, 500);
    }

    return jsonResponse({ roleTabAccess, persisted: true, storageReady: true, updatedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rolrechten opslaan mislukt.";
    return jsonResponse({ error: message }, 500);
  }
}
