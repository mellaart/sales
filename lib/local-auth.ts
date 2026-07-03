import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { LOCAL_SESSION_COOKIE } from "@/lib/local-auth-shared";
import { createId, ensureLocalSchema, query, queryWithoutSchema } from "@/lib/local-db";
import { getEffectiveUserRole, isProtectedAdminEmail } from "@/lib/protected-admin";
import type { ProfileRecord, UserRole } from "@/lib/supabase";

const SESSION_TTL_SECONDS = 12 * 60 * 60;

type DbProfile = ProfileRecord & {
  password_hash?: string | null;
  must_set_password?: boolean | null;
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

  return {
    id: profile.id,
    email: profile.email,
    user_metadata: {
      full_name: profile.full_name ?? null,
      display_name: profile.full_name ?? null,
      name: profile.full_name ?? null,
      job_title: profile.job_title ?? null,
      workdays: profile.workdays ?? null,
      mobile_phone: profile.mobile_phone ?? null,
      role,
      must_set_password: profile.must_set_password ?? false,
    },
  };
}

export async function getLocalProfile(userId: string) {
  await ensureLocalSchema();

  const { rows } = await queryWithoutSchema<DbProfile>(
    `select id, email, full_name, job_title, workdays, mobile_phone, role, must_set_password, created_at, updated_at
     from public.profiles
     where id = $1
     limit 1`,
    [userId],
  );

  const profile = rows[0] ?? null;
  if (!profile) return null;

  const role = getEffectiveUserRole(profile.role, profile.email) ?? profile.role;
  return { ...profile, role };
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
    `select id, email, password_hash, full_name, job_title, workdays, mobile_phone, role, must_set_password, created_at, updated_at
     from public.profiles
     where lower(email) = lower($1)
     limit 1`,
    [bootstrapEmail],
  );

  if (existingRows[0]) {
    const existing = existingRows[0];
    const passwordHash = existing.password_hash || hashPassword(password);
    const { rows } = await queryWithoutSchema<DbProfile>(
      `update public.profiles
       set role = 'admin',
           password_hash = $2,
           must_set_password = false,
           updated_at = now()
       where id = $1
       returning *`,
      [existing.id, passwordHash],
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

export async function signInLocal(email: string, password: string) {
  await ensureLocalSchema();

  const normalizedEmail = normalizeEmail(email);
  const bootstrapped = await ensureBootstrapAdmin(normalizedEmail, password);
  const { rows } = bootstrapped
    ? { rows: [bootstrapped] }
    : await queryWithoutSchema<DbProfile>(
        `select id, email, password_hash, full_name, job_title, workdays, mobile_phone, role, must_set_password, created_at, updated_at
         from public.profiles
         where lower(email) = lower($1)
         limit 1`,
        [normalizedEmail],
      );

  const profile = rows[0] ?? null;
  if (!profile || !verifyPassword(password, profile.password_hash)) {
    return { error: "E-mailadres of wachtwoord klopt niet." };
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

  await queryWithoutSchema(
    `insert into public.app_sessions (token_hash, user_id, expires_at)
     values ($1, $2, to_timestamp($3))`,
    [hashToken(token), profile.id, expiresAt],
  );

  return {
    session: {
      access_token: token,
      expires_at: expiresAt,
      user: toLocalUser(profile),
    } satisfies LocalSession,
  };
}

export function readBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);

  const cookieHeader = request.headers.get("cookie") ?? "";
  const tokenCookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCAL_SESSION_COOKIE}=`));

  return tokenCookie ? decodeURIComponent(tokenCookie.slice(LOCAL_SESSION_COOKIE.length + 1)) : null;
}

export async function getLocalSession(token: string | null) {
  if (!token) return null;
  await ensureLocalSchema();

  const { rows } = await queryWithoutSchema<DbProfile & { expires_at_epoch: number }>(
    `select p.id, p.email, p.full_name, p.job_title, p.workdays, p.mobile_phone, p.role,
            p.must_set_password, p.created_at, p.updated_at,
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
           role = excluded.role,
           updated_at = now()
     returning *`,
    [
      createId(),
      email,
      hashPassword(password),
      input.fullName || email.split("@")[0],
      input.jobTitle || null,
      input.workdays || null,
      input.mobilePhone || null,
      input.role || "sales",
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
