import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { ensureProtectedAdminRole } from "@/lib/protected-admin-server";
import type { UserRole } from "@/lib/supabase";

const allowedRoles: UserRole[] = ["sales", "support", "consultant", "manager", "admin"];

type ServiceClient = ReturnType<typeof getServiceClient>;

type ProfileLookup = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  role?: UserRole | null;
};

function isMissingFullNameColumnError(message: string) {
  return (
    message.includes("Could not find the 'full_name' column of 'profiles' in the schema cache") ||
    message.includes("profiles.full_name does not exist") ||
    message.includes("column profiles.full_name does not exist")
  );
}

function isUserAlreadyExistsError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("already") ||
    normalized.includes("exists") ||
    normalized.includes("registered") ||
    normalized.includes("duplicate")
  );
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server keys ontbreken.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase client keys ontbreken.");
  }

  return createClient(url, anonKey);
}

async function verifyAdmin(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return { ok: false, message: "Niet ingelogd." } as const;

  const service = getServiceClient();
  const anon = getAnonClient();
  const { data: userData, error: userError } = await anon.auth.getUser(token);

  if (userError || !userData.user) return { ok: false, message: "Ongeldige sessie." } as const;

  await ensureProtectedAdminRole(service, userData.user);

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!isProtectedAdminEmail(userData.user.email) && (profileError || !profile || profile.role !== "admin")) {
    return { ok: false, message: "Geen toegang." } as const;
  }

  return { ok: true, service } as const;
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function findProfileByEmail(service: ServiceClient, email: string) {
  const { data, error } = await service
    .from("profiles")
    .select("id,email,full_name,role")
    .eq("email", email)
    .maybeSingle();

  if (!error) {
    return (data as ProfileLookup | null) ?? null;
  }

  if (!isMissingFullNameColumnError(error.message)) {
    throw new Error(error.message);
  }

  const fallbackResult = await service
    .from("profiles")
    .select("id,email,role")
    .eq("email", email)
    .maybeSingle();

  if (fallbackResult.error) {
    throw new Error(fallbackResult.error.message);
  }

  return (fallbackResult.data as ProfileLookup | null) ?? null;
}

async function writeProfile(
  service: ServiceClient,
  profile: { id: string; email: string; role: UserRole; fullName: string | null },
) {
  const profilePayload = {
    id: profile.id,
    email: profile.email,
    role: profile.role,
    full_name: profile.fullName,
  };

  let { error: profileError } = await service.from("profiles").upsert(profilePayload);

  if (profileError && isMissingFullNameColumnError(profileError.message)) {
    const fallbackResult = await service.from("profiles").upsert({
      id: profile.id,
      email: profile.email,
      role: profile.role,
    });
    profileError = fallbackResult.error;
  }

  return profileError;
}

async function updateExistingProfile(
  service: ServiceClient,
  profile: { id: string; email: string; role: UserRole; fullName: string | null },
) {
  const updatePayload = profile.fullName
    ? { email: profile.email, role: profile.role, full_name: profile.fullName }
    : { email: profile.email, role: profile.role };

  let { error: profileError } = await service
    .from("profiles")
    .update(updatePayload)
    .eq("id", profile.id);

  if (profileError && isMissingFullNameColumnError(profileError.message)) {
    const fallbackResult = await service
      .from("profiles")
      .update({ email: profile.email, role: profile.role })
      .eq("id", profile.id);
    profileError = fallbackResult.error;
  }

  return profileError;
}

async function updateUserMetadata(
  service: ServiceClient,
  userId: string,
  values: { fullName: string | null; role: UserRole },
) {
  const { data: userData } = await service.auth.admin.getUserById(userId);
  const nextMetadata = {
    ...(userData.user?.user_metadata ?? {}),
    role: values.role,
    ...(values.fullName ? { full_name: values.fullName } : {}),
  };

  const { error } = await service.auth.admin.updateUserById(userId, {
    user_metadata: nextMetadata,
  });

  return error;
}

export async function POST(request: Request) {
  try {
    const verified = await verifyAdmin(request);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message }, { status: 403 });
    }

    const body = (await request.json()) as { email?: string; fullName?: string; role?: UserRole };
    const email = body.email?.trim().toLowerCase();
    const fullName = normalizeText(body.fullName);
    const role = body.role;

    if (!email || !role) {
      return NextResponse.json({ error: "E-mail en rol zijn verplicht." }, { status: 400 });
    }

    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: "Ongeldige rol." }, { status: 400 });
    }

    if (isProtectedAdminEmail(email) && role !== "admin") {
      return NextResponse.json({ error: "Deze gebruiker is beschermd en moet altijd admin blijven." }, { status: 400 });
    }

    const existingProfile = await findProfileByEmail(verified.service, email);

    if (existingProfile) {
      if (isProtectedAdminEmail(email)) {
        return NextResponse.json({ error: "Deze beschermde admin-gebruiker kan hier niet worden aangepast." }, { status: 400 });
      }

      const profileError = await updateExistingProfile(verified.service, {
        id: existingProfile.id,
        email,
        role,
        fullName,
      });

      if (profileError) {
        return NextResponse.json({ error: `Profiel bijwerken mislukt: ${profileError.message}` }, { status: 500 });
      }

      const metadataError = await updateUserMetadata(verified.service, existingProfile.id, { fullName, role });

      return NextResponse.json({
        id: existingProfile.id,
        existing: true,
        metadataWarning: metadataError?.message ?? null,
      });
    }

    const redirectTo = `${new URL(request.url).origin}/reset-password`;

    const { data, error } = await verified.service.auth.admin.inviteUserByEmail(email, {
      data: { role, full_name: fullName, must_set_password: true },
      redirectTo,
    });

    if (error || !data.user) {
      if (error && isUserAlreadyExistsError(error.message)) {
        return NextResponse.json({ error: "Gebruiker bestaat al, maar er is nog geen profiel gevonden." }, { status: 409 });
      }

      return NextResponse.json({ error: error?.message ?? "Gebruiker aanmaken mislukt." }, { status: 400 });
    }

    const profileError = await writeProfile(verified.service, {
      id: data.user.id,
      email,
      role,
      fullName,
    });

    if (profileError) {
      return NextResponse.json({ error: `Gebruiker aangemaakt, profiel bijwerken mislukt: ${profileError.message}` }, { status: 500 });
    }

    return NextResponse.json({ id: data.user.id, existing: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gebruiker aanmaken mislukt." }, { status: 500 });
  }
}
