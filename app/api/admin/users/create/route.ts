import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/supabase";

const allowedRoles: UserRole[] = ["sales", "support", "consultant", "manager", "admin"];

type ServiceClient = ReturnType<typeof createClient>;
type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
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

async function verifyAdmin(request: Request) {
  const service = getServiceClient();
  const anon = getAnonClient();

  if (!service || !anon) {
    return { ok: false, message: "Server configuratie ontbreekt." } as const;
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) return { ok: false, message: "Niet ingelogd." } as const;

  const { data: userData, error: userError } = await anon.auth.getUser(token);

  if (userError || !userData.user) return { ok: false, message: "Ongeldige sessie." } as const;

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "admin") {
    return { ok: false, message: "Geen toegang." } as const;
  }

  return { ok: true, service } as const;
}

async function findUserByEmail(service: ServiceClient, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw new Error(error.message);
    }

    const users = ((data?.users ?? []) as AuthUser[]);
    const match = users.find((user) => user.email?.trim().toLowerCase() === normalizedEmail);

    if (match) return match;
    if (users.length < perPage) return null;
  }

  return null;
}

async function upsertProfile(
  service: ServiceClient,
  profile: { id: string; email: string; role: UserRole; fullName: string | null },
) {
  const profilePayload: { id: string; email: string; role: UserRole; full_name?: string } = {
    id: profile.id,
    email: profile.email,
    role: profile.role,
  };

  if (profile.fullName) {
    profilePayload.full_name = profile.fullName;
  }

  let { error } = await service.from("profiles").upsert(profilePayload);

  if (error && isMissingFullNameColumnError(error.message)) {
    const fallbackResult = await service.from("profiles").upsert({
      id: profile.id,
      email: profile.email,
      role: profile.role,
    });
    error = fallbackResult.error;
  }

  return error;
}

async function syncExistingUser(
  service: ServiceClient,
  user: AuthUser,
  values: { email: string; role: UserRole; fullName: string | null },
) {
  const profileError = await upsertProfile(service, {
    id: user.id,
    email: values.email,
    role: values.role,
    fullName: values.fullName,
  });

  if (profileError) {
    return `Profiel bijwerken mislukt: ${profileError.message}`;
  }

  const nextMetadata: Record<string, unknown> = {
    ...(user.user_metadata ?? {}),
    role: values.role,
  };

  if (values.fullName) {
    nextMetadata.full_name = values.fullName;
  }

  const { error: metadataError } = await service.auth.admin.updateUserById(user.id, {
    user_metadata: nextMetadata,
  });

  if (metadataError) {
    return `Gebruikersgegevens bijwerken mislukt: ${metadataError.message}`;
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const verified = await verifyAdmin(request);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message }, { status: 403 });
    }

    const body = (await request.json()) as { email?: string; fullName?: string; role?: UserRole };
    const email = body.email?.trim().toLowerCase();
    const fullName = body.fullName?.trim() || null;
    const role = body.role;

    if (!email || !role) {
      return NextResponse.json({ error: "E-mail en rol zijn verplicht." }, { status: 400 });
    }

    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: "Ongeldige rol." }, { status: 400 });
    }

    let existingUser: AuthUser | null = null;

    try {
      existingUser = await findUserByEmail(verified.service, email);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Bestaande gebruikers controleren mislukt." },
        { status: 500 },
      );
    }

    if (existingUser) {
      const syncError = await syncExistingUser(verified.service, existingUser, { email, fullName, role });

      if (syncError) {
        return NextResponse.json({ error: syncError }, { status: 500 });
      }

      return NextResponse.json({ id: existingUser.id, existing: true });
    }

    const redirectTo = `${new URL(request.url).origin}/reset-password`;

    const { data, error } = await verified.service.auth.admin.inviteUserByEmail(email, {
      data: { role, full_name: fullName, must_set_password: true },
      redirectTo,
    });

    if (error || !data.user) {
      if (error && isUserAlreadyExistsError(error.message)) {
        const fallbackUser = await findUserByEmail(verified.service, email);

        if (fallbackUser) {
          const syncError = await syncExistingUser(verified.service, fallbackUser, { email, fullName, role });

          if (syncError) {
            return NextResponse.json({ error: syncError }, { status: 500 });
          }

          return NextResponse.json({ id: fallbackUser.id, existing: true });
        }
      }

      return NextResponse.json({ error: error?.message ?? "Gebruiker aanmaken mislukt." }, { status: 400 });
    }

    const profileError = await upsertProfile(verified.service, {
      id: data.user.id,
      email,
      role,
      fullName,
    });

    if (profileError) {
      return NextResponse.json(
        { error: `Gebruiker aangemaakt, profiel bijwerken mislukt: ${profileError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ id: data.user.id, existing: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gebruiker aanmaken mislukt." }, { status: 500 });
  }
}
