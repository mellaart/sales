import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "@/lib/local-auth";
import { isSelfHostedMode, query, withTransaction } from "@/lib/local-db";
import { sendPasswordResetEmail } from "@/lib/password-reset-email";

export const PASSWORD_RESET_MESSAGE = "Als dit e-mailadres bij ons bekend is, ontvang je een herstelmail. De link is 30 minuten geldig. Controleer ook je ongewenste e-mail.";
const INVALID_LINK = "Deze herstellink is ongeldig, verlopen of al gebruikt. Vraag via het inlogscherm een nieuwe link aan.";
const EMAIL_PATTERN = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function requestLocalPasswordReset(email: string) {
  if (!isSelfHostedMode()) throw new Error("Gebruik de ingestelde aanmeldprovider.");
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail.length > 254 || !EMAIL_PATTERN.test(normalizedEmail)) {
    return { error: "Vul een geldig e-mailadres in." };
  }

  await query("delete from public.app_password_reset_requests where last_requested_at < now() - interval '1 day'");
  await query("delete from public.app_password_resets where expires_at <= now()");
  // Persistent, atomic throttling also applies to unknown addresses and multiple server processes.
  const { rowCount } = await query(
    `insert into public.app_password_reset_requests (email_hash, last_requested_at, window_started_at, attempts)
     values ($1, now(), now(), 1)
     on conflict (email_hash) do update
       set last_requested_at = now(),
           window_started_at = case when app_password_reset_requests.window_started_at <= now() - interval '1 hour'
             then now() else app_password_reset_requests.window_started_at end,
           attempts = case when app_password_reset_requests.window_started_at <= now() - interval '1 hour'
             then 1 else app_password_reset_requests.attempts + 1 end
     where app_password_reset_requests.last_requested_at <= now() - interval '2 minutes'
       and (app_password_reset_requests.window_started_at <= now() - interval '1 hour'
         or app_password_reset_requests.attempts < 3)
     returning email_hash`,
    [hash(normalizedEmail)],
  );
  if (!rowCount) return {};

  const { rows } = await query<{ id: string; email: string; password_hash: string | null }>(
    "select id, email, password_hash from public.profiles where lower(btrim(email)) = $1 limit 1",
    [normalizedEmail],
  );
  const profile = rows[0];
  if (!profile) return {};

  const token = randomBytes(32).toString("hex");
  const tokenHash = hash(token);
  await query(
    `insert into public.app_password_resets (user_id, token_hash, password_hash, email, expires_at)
     values ($1, $2, $3, $4, now() + interval '30 minutes')
     on conflict (user_id) do update set token_hash = excluded.token_hash,
       password_hash = excluded.password_hash, email = excluded.email, expires_at = excluded.expires_at`,
    [profile.id, tokenHash, profile.password_hash, normalizedEmail],
  );

  try {
    await sendPasswordResetEmail(normalizedEmail, token);
  } catch {
    await query("delete from public.app_password_resets where token_hash = $1", [tokenHash]);
    // Do not reveal account existence, tokens or mail-provider output in a public response/log.
    console.error("Wachtwoordherstelmail kon niet worden aangeboden aan de mailserver. Controleer de server-mailconfiguratie.");
  }
  return {};
}

export async function completeLocalPasswordReset(token: string, password: string) {
  if (!isSelfHostedMode()) throw new Error("Gebruik de ingestelde aanmeldprovider.");
  if (!/^[a-f0-9]{64}$/.test(token)) return { error: INVALID_LINK };
  if (password.length < 6) return { error: "Wachtwoord moet minimaal 6 tekens zijn." };
  if (password.length > 1024) return { error: "Wachtwoord mag maximaal 1024 tekens zijn." };

  return withTransaction(async (client) => {
    // Lock the user before consuming the token; concurrent resets cannot both succeed.
    const { rows } = await client.query<{ id: string }>(
      `select p.id from public.profiles p
       inner join public.app_password_resets r on r.user_id = p.id
       where r.token_hash = $1 and r.expires_at > now()
         and r.password_hash is not distinct from p.password_hash
         and r.email = lower(btrim(p.email))
       for update of p`,
      [hash(token)],
    );
    const userId = rows[0]?.id;
    if (!userId) return { error: INVALID_LINK };
    const consumed = await client.query(
      "delete from public.app_password_resets where user_id = $1 and token_hash = $2 and expires_at > now() returning user_id",
      [userId, hash(token)],
    );
    if (!consumed.rowCount) return { error: INVALID_LINK };

    await client.query(
      "update public.profiles set password_hash = $2, must_set_password = false, updated_at = now() where id = $1",
      [userId, hashPassword(password)],
    );
    await client.query("delete from public.app_sessions where user_id = $1", [userId]);
    await client.query("delete from public.app_trusted_devices where user_id = $1", [userId]);
    await client.query("delete from public.app_2fa_challenges where user_id = $1", [userId]);
    return {};
  });
}
