import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { LOCAL_SESSION_COOKIE, LOCAL_TRUSTED_DEVICE_COOKIE } from "@/lib/local-auth-shared";
import { createId, ensureLocalSchema, query, queryWithoutSchema } from "@/lib/local-db";
import { getEffectiveUserRole, getProtectedAdminProfile, isProtectedAdminEmail } from "@/lib/protected-admin";
import type { ProfileRecord, UserRole } from "@/lib/supabase";
import {
  createOtpAuthUrl,
  decryptTwoFactorSecret,
  encryptTwoFactorSecret,
  generateTwoFactorSecret,
  verifyTotpCode,
} from "@/lib/two-factor";

const SESSION_TTL_SECONDS = 10 * 60 * 60;
const TWO_FACTOR_CHALLENGE_TTL_SECONDS = 10 * 60;
const TRUSTED_DEVICE_TTL_SECONDS = 30 * 24 * 60 * 60;

type DbProfile = ProfileRecord & {
  password_hash?: string | null;
  must_set_password?: boolean | null;
  two_factor_secret?: string | null;
  two_factor_enabled?: boolean | null;
  two_factor_enabled_at?: string | null;
  two_factor_last_verified_at?: string | null;
};

export type LocalUser = {
  id: string;
  email: string | null;
  user_metadata: {
    full_name?: string | null;
    display_name?: string | null;
    name?: string | null;
    job_title?: string | null;
    workdays?: string | null;
    mobile_phone?: string | null;
    role?: UserRole | null;
    must_set_password?: boolean | null;
    two_factor_enabled?: boolean | null;
  };
};

export type LocalSession = {
  access_token: string;
  expires_at: number;
  user: LocalUser;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash?.startsWith("scrypt:")) return false;

  const [, salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function toLocalUser(profile: DbProfile): LocalUser {
  const role = getEffectiveUserRole(profile.role, profile.email) ?? profile.role;
  const protectedProfile = getProtectedAdminProfile(profile.email);
  const fullName = protectedProfile?.fullName ?? profile.full_name ?? null;

  return {
    id: profile.id,
    email: profile.email,
    user_metadata: {
      full_name: fullName,
      display_name: fullName,
      name: fullName,
      job_title: protectedProfile?.jobTitle ?? profile.job_title ?? null,
      workdays: protectedProfile?.workdays ?? profile.workdays ?? null,
      mobile_phone: protectedProfile?.mobilePhone ?? profile.mobile_phone ?? null,
      role,
      must_set_password: profile.must_set_password ?? false,
      two_factor_enabled: profile.two_factor_enabled ?? false,
    },
  };
}

export async function getLocalProfile(userId: string) {
  await ensureLocalSchema();

  const { rows } = await queryWithoutSchema<DbProfile>(
    `select id, email, full_name, job_title, workdays, mobile_phone, role, must_set_password,
            two_factor_enabled, two_factor_secret, two_factor_enabled_at, two_factor_last_verified_at,
            created_at, updated_at
     from public.profiles
     where id = $1
     limit 1`,
    [userId],
  );

  const profile = rows[0] ?? null;
  if (!profile) return null;

  const role = getEffectiveUserRole(profile.role, profile.email) ?? profile.role;
  const protectedProfile = getProtectedAdminProfile(profile.email);

  return {
    ...profile,
    full_name: protectedProfile?.fullName ?? profile.full_name,
    job_title: protectedProfile?.jobTitle ?? profile.job_title,
    workdays: protectedProfile?.workdays ?? profile.workdays,
    mobile_phone: protectedProfile?.mobilePhone ?? profile.mobile_phone,
    role,
  };
}

async function countUsers() {
  const { rows } = await queryWithoutSchema<{ count: string }>("select count(*)::text as count from public.profiles");
  return Number(rows[0]?.count ?? 0);
}

async function ensureBootstrapAdmin(email: string, password: string) {
  await ensureLocalSchema();

  const bootstrapEmail = normalizeEmail(process.env.SALES_BOOTSTRAP_ADMIN_EMAIL || "erik@smarttrade.nl");
  const bootstrapPassword = process.env.SALES_BOOTSTRAP_ADMIN_PASSWORD;

  if (!bootstrapPassword || normalizeEmail(email) !== bootstrapEmail || password !== bootstrapPassword) {
    return null;
  }

  const { rows: existingRows } = await queryWithoutSchema<DbProfile>(
    `select id, email, password_hash, full_name, job_title, workdays, mobile_phone, role, must_set_password,
            two_factor_enabled, two_factor_secret, two_factor_enabled_at, two_factor_last_verified_at,
            created_at, updated_at
     from public.profiles
     where lower(email) = lower($1)
     limit 1`,
    [bootstrapEmail],
  );

  if (existingRows[0]) {
    const existing = existingRows[0];
    const passwordHash = existing.password_hash || hashPassword(password);
    const protectedProfile = getProtectedAdminProfile(bootstrapEmail);
    const { rows } = await queryWithoutSchema<DbProfile>(
      `update public.profiles
       set role = 'admin',
           full_name = $3,
           job_title = $4,
           workdays = $5,
           mobile_phone = $6,
           password_hash = $2,
           must_set_password = false,
           updated_at = now()
       where id = $1
       returning *`,
      [
        existing.id,
        passwordHash,
        protectedProfile?.fullName ?? "Erik Mellaart",
        protectedProfile?.jobTitle ?? "IT Sales Consultant",
        protectedProfile?.workdays ?? "di - wo - do - vr",
        protectedProfile?.mobilePhone ?? "+31 630 050 413",
      ],
    );
    return rows[0] ?? null;
  }

  if ((await countUsers()) > 0) return null;

  const { rows } = await queryWithoutSchema<DbProfile>(
    `insert into public.profiles
      (id, email, password_hash, full_name, job_title, workdays, mobile_phone, role, must_set_password)
     values ($1, $2, $3, 'Erik Mellaart', 'IT Sales Consultant', 'di - wo - do - vr', '+31 630 050 413', 'admin', false)
     returning *`,
    [createId(), bootstrapEmail, hashPassword(password)],
  );

  return rows[0] ?? null;
}

async function createSession(profile: DbProfile) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

  await queryWithoutSchema(
    `insert into public.app_sessions (token_hash, user_id, expires_at)
     values ($1, $2, to_timestamp($3))`,
    [hashToken(token), profile.id, expiresAt],
  );

  return {
    access_token: token,
    expires_at: expiresAt,
    user: toLocalUser(profile),
  } satisfies LocalSession;
}

async function createTrustedDevice(profile: DbProfile) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + TRUSTED_DEVICE_TTL_SECONDS;

  await queryWithoutSchema("delete from public.app_trusted_devices where expires_at <= now()");
  await queryWithoutSchema(
    `insert into public.app_trusted_devices (token_hash, user_id, expires_at)
     values ($1, $2, to_timestamp($3))`,
    [hashToken(token), profile.id, expiresAt],
  );

  return { token, expiresAt };
}

async function isTrustedDeviceForUser(token: string | null, userId: string) {
  if (!token) return false;

  const tokenHash = hashToken(token);
  const { rowCount } = await queryWithoutSchema(
    `update public.app_trusted_devices
     set last_used_at = now()
     where token_hash = $1
       and user_id = $2
       and expires_at > now()`,
    [tokenHash, userId],
  );

  if (!rowCount) {
    await queryWithoutSchema(
      "delete from public.app_trusted_devices where token_hash = $1 and expires_at <= now()",
      [tokenHash],
    );
  }

  return Boolean(rowCount);
}

async function createTwoFactorChallenge(profile: DbProfile, mode: "setup" | "verify") {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + TWO_FACTOR_CHALLENGE_TTL_SECONDS;
  const setupSecret = mode === "setup" ? generateTwoFactorSecret() : null;

  await queryWithoutSchema("delete from public.app_2fa_challenges where user_id = $1 or expires_at <= now()", [
    profile.id,
  ]);

  await queryWithoutSchema(
    `insert into public.app_2fa_challenges (token_hash, user_id, mode, secret, expires_at)
     values ($1, $2, $3, $4, to_timestamp($5))`,
    [hashToken(token), profile.id, mode, setupSecret ? encryptTwoFactorSecret(setupSecret) : null, expiresAt],
  );

  return {
    challengeToken: token,
    expiresAt,
    mode,
    manualEntryKey: setupSecret,
    otpAuthUrl: setupSecret && profile.email
      ? createOtpAuthUrl({ issuer: "Smart Trade Sales", email: profile.email, secret: setupSecret })
      : null,
  };
}

export async function signInLocal(email: string, password: string, trustedDeviceToken: string | null = null) {
  await ensureLocalSchema();

  const normalizedEmail = normalizeEmail(email);
  const bootstrapped = await ensureBootstrapAdmin(normalizedEmail, password);
  const { rows } = bootstrapped
    ? { rows: [bootstrapped] }
    : await queryWithoutSchema<DbProfile>(
        `select id, email, password_hash, full_name, job_title, workdays, mobile_phone, role, must_set_password,
                two_factor_enabled, two_factor_secret, two_factor_enabled_at, two_factor_last_verified_at,
                created_at, updated_at
         from public.profiles
         where lower(email) = lower($1)
         limit 1`,
        [normalizedEmail],
      );

  const profile = rows[0] ?? null;
  if (!profile || !verifyPassword(password, profile.password_hash)) {
    return { error: "E-mailadres of wachtwoord klopt niet." };
  }

  if (
    profile.two_factor_enabled &&
    profile.two_factor_secret &&
    await isTrustedDeviceForUser(trustedDeviceToken, profile.id)
  ) {
    return { session: await createSession(profile) };
  }

  const challenge = await createTwoFactorChallenge(
    profile,
    profile.two_factor_enabled && profile.two_factor_secret ? "verify" : "setup",
  );

  return {
    twoFactor: {
      challengeToken: challenge.challengeToken,
      expiresAt: challenge.expiresAt,
      mode: challenge.mode,
      email: profile.email,
      manualEntryKey: challenge.manualEntryKey,
      otpAuthUrl: challenge.otpAuthUrl,
    },
  };
}

export async function verifyLocalTwoFactor(challengeToken: string, code: string, rememberDevice = false) {
  await ensureLocalSchema();

  const { rows } = await queryWithoutSchema<
    DbProfile & {
      challenge_mode: "setup" | "verify";
      challenge_secret?: string | null;
    }
  >(
    `select p.id, p.email, p.password_hash, p.full_name, p.job_title, p.workdays, p.mobile_phone, p.role,
            p.must_set_password, p.two_factor_enabled, p.two_factor_secret,
            p.two_factor_enabled_at, p.two_factor_last_verified_at, p.created_at, p.updated_at,
            c.mode as challenge_mode, c.secret as challenge_secret
     from public.app_2fa_challenges c
     join public.profiles p on p.id = c.user_id
     where c.token_hash = $1
       and c.expires_at > now()
     limit 1`,
    [hashToken(challengeToken)],
  );

  const profile = rows[0] ?? null;
  if (!profile) {
    return { error: "2FA-controle is verlopen. Log opnieuw in." };
  }

  const secretSource = profile.challenge_mode === "setup" ? profile.challenge_secret : profile.two_factor_secret;
  if (!secretSource) {
    return { error: "2FA sleutel ontbreekt. Log opnieuw in." };
  }

  let secret: string;
  try {
    secret = decryptTwoFactorSecret(secretSource);
  } catch {
    return { error: "2FA sleutel kon niet gelezen worden. Laat een admin 2FA resetten." };
  }

  if (!verifyTotpCode(secret, code)) {
    return { error: "2FA-code klopt niet." };
  }

  if (profile.challenge_mode === "setup") {
    const encryptedSecret = encryptTwoFactorSecret(secret);
    await queryWithoutSchema(
      `update public.profiles
       set two_factor_enabled = true,
           two_factor_secret = $2,
           two_factor_enabled_at = coalesce(two_factor_enabled_at, now()),
           two_factor_last_verified_at = now(),
           updated_at = now()
       where id = $1`,
      [profile.id, encryptedSecret],
    );
    profile.two_factor_enabled = true;
    profile.two_factor_secret = encryptedSecret;
    profile.two_factor_enabled_at = new Date().toISOString();
    profile.two_factor_last_verified_at = new Date().toISOString();
  } else {
    await queryWithoutSchema(
      `update public.profiles
       set two_factor_last_verified_at = now(),
           updated_at = now()
       where id = $1`,
      [profile.id],
    );
  }

  await queryWithoutSchema("delete from public.app_2fa_challenges where token_hash = $1", [hashToken(challengeToken)]);

  return {
    session: await createSession(profile),
    trustedDevice: rememberDevice ? await createTrustedDevice(profile) : null,
  };
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

export function readBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);

  return readCookie(request, LOCAL_SESSION_COOKIE);
}

export function readTrustedDeviceToken(request: Request) {
  return readCookie(request, LOCAL_TRUSTED_DEVICE_COOKIE);
}

export async function getLocalSession(token: string | null) {
  if (!token) return null;
  await ensureLocalSchema();

  const { rows } = await queryWithoutSchema<DbProfile & { expires_at_epoch: number }>(
    `select p.id, p.email, p.full_name, p.job_title, p.workdays, p.mobile_phone, p.role,
            p.must_set_password, p.two_factor_enabled, p.two_factor_secret,
            p.two_factor_enabled_at, p.two_factor_last_verified_at, p.created_at, p.updated_at,
            extract(epoch from s.expires_at)::integer as expires_at_epoch
     from public.app_sessions s
     join public.profiles p on p.id = s.user_id
     where s.token_hash = $1
       and s.expires_at > now()
     limit 1`,
    [hashToken(token)],
  );

  const profile = rows[0] ?? null;
  if (!profile) return null;

  await queryWithoutSchema("update public.app_sessions set last_seen_at = now() where token_hash = $1", [hashToken(token)]);

  return {
    access_token: token,
    expires_at: profile.expires_at_epoch,
    user: toLocalUser(profile),
  } satisfies LocalSession;
}

export async function getLocalSessionFromRequest(request: Request) {
  return getLocalSession(readBearerToken(request));
}

export async function requireLocalUser(request: Request) {
  const session = await getLocalSessionFromRequest(request);
  if (!session) return { ok: false as const, message: "Niet ingelogd." };

  const profile = await getLocalProfile(session.user.id);
  if (!profile) return { ok: false as const, message: "Gebruiker niet gevonden." };

  return { ok: true as const, session, user: session.user, profile };
}

export async function signOutLocal(token: string | null) {
  if (!token) return;
  await ensureLocalSchema();
  await queryWithoutSchema("delete from public.app_sessions where token_hash = $1", [hashToken(token)]);
}

export async function updateLocalPassword(token: string | null, password: string) {
  const session = await getLocalSession(token);
  if (!session) return { error: "Niet ingelogd." };
  if (password.length < 6) return { error: "Wachtwoord moet minimaal 6 tekens zijn." };

  await query(
    `update public.profiles
     set password_hash = $2,
         must_set_password = false,
         updated_at = now()
     where id = $1`,
    [session.user.id, hashPassword(password)],
  );
  await queryWithoutSchema("delete from public.app_trusted_devices where user_id = $1", [session.user.id]);

  return {};
}

export async function updateLocalPasswordForUser(userId: string, password: string, mustSetPassword = false) {
  await ensureLocalSchema();
  if (password.length < 6) return { error: "Wachtwoord moet minimaal 6 tekens zijn." };

  const { rowCount } = await queryWithoutSchema(
    `update public.profiles
     set password_hash = $2,
         must_set_password = $3,
         updated_at = now()
     where id = $1`,
    [userId, hashPassword(password), mustSetPassword],
  );

  if (!rowCount) return { error: "Gebruiker niet gevonden." };
  await queryWithoutSchema("delete from public.app_sessions where user_id = $1", [userId]);
  await queryWithoutSchema("delete from public.app_trusted_devices where user_id = $1", [userId]);
  return {};
}

export async function resetLocalTwoFactorForUser(userId: string) {
  await ensureLocalSchema();

  const { rowCount } = await queryWithoutSchema(
    `update public.profiles
     set two_factor_enabled = false,
         two_factor_secret = null,
         two_factor_enabled_at = null,
         two_factor_last_verified_at = null,
         updated_at = now()
     where id = $1`,
    [userId],
  );

  await queryWithoutSchema("delete from public.app_2fa_challenges where user_id = $1", [userId]);
  await queryWithoutSchema("delete from public.app_trusted_devices where user_id = $1", [userId]);

  if (!rowCount) return { error: "Gebruiker niet gevonden." };
  return {};
}

export async function createLocalUser(input: {
  email: string;
  fullName?: string | null;
  jobTitle?: string | null;
  workdays?: string | null;
  mobilePhone?: string | null;
  role?: UserRole;
  password?: string | null;
  mustSetPassword?: boolean;
}) {
  const email = normalizeEmail(input.email);
  const protectedProfile = getProtectedAdminProfile(email);
  const password = input.password || randomBytes(12).toString("base64url");

  const { rows } = await query<DbProfile>(
    `insert into public.profiles
      (id, email, password_hash, full_name, job_title, workdays, mobile_phone, role, must_set_password)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (email) do update
       set full_name = excluded.full_name,
           job_title = excluded.job_title,
           workdays = excluded.workdays,
           mobile_phone = excluded.mobile_phone,
           password_hash = coalesce(public.profiles.password_hash, excluded.password_hash),
           role = excluded.role,
           must_set_password = case
             when public.profiles.password_hash is null then excluded.must_set_password
             else public.profiles.must_set_password
           end,
           updated_at = now()
     returning *`,
    [
      createId(),
      email,
      hashPassword(password),
      protectedProfile?.fullName ?? input.fullName ?? email.split("@")[0],
      protectedProfile?.jobTitle ?? input.jobTitle ?? null,
      protectedProfile?.workdays ?? input.workdays ?? null,
      protectedProfile?.mobilePhone ?? input.mobilePhone ?? null,
      protectedProfile ? "admin" : input.role || "sales",
      input.mustSetPassword ?? true,
    ],
  );

  return { user: toLocalUser(rows[0]), temporaryPassword: password };
}

export function setLocalSessionCookie(response: NextResponse, token: string, expiresAt: number) {
  response.cookies.set(LOCAL_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt * 1000),
  });
}

export function setLocalTrustedDeviceCookie(response: NextResponse, token: string, expiresAt: number) {
  response.cookies.set(LOCAL_TRUSTED_DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt * 1000),
  });
}

export function clearLocalSessionCookie(response: NextResponse) {
  response.cookies.set(LOCAL_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function canReadAllDeals(role: UserRole | null) {
  return role === "admin" || role === "manager" || role === "support";
}

export function canManageWorldline(role: UserRole | null) {
  return role === "admin" || role === "manager" || role === "worldline";
}

export function isLocalAdmin(profile: Pick<ProfileRecord, "email" | "role">) {
  return profile.role === "admin" || isProtectedAdminEmail(profile.email);
}
