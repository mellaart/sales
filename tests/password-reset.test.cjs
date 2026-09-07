const assert = require("node:assert/strict");
const { before, beforeEach, after, test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { createHash, scryptSync } = require("node:crypto");
const { EventEmitter } = require("node:events");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");

const root = resolve(__dirname, "..");
const db = new PGlite();
const mail = [];
let mailFails = false;
let selfHosted = true;
let failSessionDelete = false;
const userId = "00000000-0000-4000-8000-000000000001";
const email = "colleague@example.test";

async function query(sql, values = [], executor = db) {
  if (failSessionDelete && sql.startsWith("delete from public.app_sessions")) throw new Error("Simulated database failure");
  const result = await executor.query(sql, values);
  return { rows: result.rows, rowCount: result.affectedRows || result.rows.length };
}

// Compile real application modules, replacing only the DB transport and email delivery.
function loader(overrides) {
  const cache = new Map();
  return function load(name) {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (!name.startsWith("@/")) return require(name);
    if (cache.has(name)) return cache.get(name).exports;
    const filename = resolve(root, `${name.slice(2)}.ts`);
    const module = { exports: {} };
    cache.set(name, module);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    new Function("require", "module", "exports", code)(load, module, module.exports);
    return module.exports;
  };
}

const load = loader({
  "@/lib/local-db": {
    isSelfHostedMode: () => selfHosted,
    query,
    withTransaction: (callback) => db.transaction((tx) => callback({ query: (sql, values) => query(sql, values, tx) })),
  },
  "@/lib/password-reset-email": {
    sendPasswordResetEmail: async (recipient, token) => {
      if (mailFails) throw new Error("Mail delivery failed");
      mail.push({ recipient, token });
    },
  },
});
const { requestLocalPasswordReset, completeLocalPasswordReset, PASSWORD_RESET_MESSAGE } = load("@/lib/local-password-reset");
const { hashPassword } = load("@/lib/local-auth");
const requestRoute = load("@/app/api/local/auth/reset-password/route");
const confirmRoute = load("@/app/api/local/auth/reset-password/confirm/route");

before(async () => {
  const source = ts.createSourceFile("local-db.ts", readFileSync(resolve(root, "lib/local-db.ts"), "utf8"), ts.ScriptTarget.Latest);
  let schema;
  const visit = (node) => {
    if (ts.isNoSubstitutionTemplateLiteral(node) && node.text.includes("create table if not exists public.profiles")) schema = node.text;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(schema, "Use the real schema migration");
  // gen_random_uuid is built into PostgreSQL; PGlite does not need the pgcrypto extension.
  await db.exec(schema.replace("create extension if not exists pgcrypto;", ""));
});

beforeEach(async () => {
  mail.length = 0;
  mailFails = false;
  selfHosted = true;
  failSessionDelete = false;
  await db.exec("truncate public.profiles cascade; truncate public.app_password_reset_requests;");
  await query(
    "insert into public.profiles (id, email, password_hash, role, two_factor_enabled, two_factor_secret) values ($1, $2, $3, 'consultant', true, 'preserved-secret')",
    [userId, email, hashPassword("original-password")],
  );
});
after(() => db.close());

test("request normalizes email, hashes the token and keeps the old password until confirmation", async () => {
  const original = (await query("select password_hash from public.profiles")).rows[0].password_hash;
  assert.deepEqual(await requestLocalPasswordReset(`  ${email.toUpperCase()}  `), {});
  assert.equal(mail.length, 1);
  assert.equal(mail[0].recipient, email);
  const row = (await query("select *, expires_at > now() and expires_at <= now() + interval '30 minutes' as timely from public.app_password_resets")).rows[0];
  assert.match(mail[0].token, /^[a-f0-9]{64}$/);
  assert.equal(row.token_hash, createHash("sha256").update(mail[0].token).digest("hex"));
  assert.equal(row.timely, true);
  assert.equal((await query("select password_hash from public.profiles")).rows[0].password_hash, original);
});

test("unknown accounts receive the same public response without an email", async () => {
  const post = (address) => requestRoute.POST(new Request("https://attacker.example/api/local/auth/reset-password", {
    method: "POST", body: JSON.stringify({ email: address, redirectTo: "https://attacker.example" }),
  }));
  const unknown = await post("unknown@example.test");
  assert.equal(mail.length, 0);
  const known = await post(email);
  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.deepEqual(await known.json(), await unknown.json());
  assert.equal(known.headers.get("cache-control"), "no-store");
  assert.ok(PASSWORD_RESET_MESSAGE.includes("Als dit e-mailadres"));
});

test("invalid addresses are rejected before database or email use", async () => {
  for (const address of ["", "invalid", "victim@example.test\r\nBcc: other@example.test", "a".repeat(255) + "@example.test"]) {
    assert.ok((await requestLocalPasswordReset(address)).error);
  }
  assert.equal(mail.length, 0);
  assert.equal((await query("select * from public.app_password_reset_requests")).rowCount, 0);
});

test("simultaneous requests are throttled, including unknown accounts", async () => {
  await Promise.all(Array.from({ length: 5 }, () => requestLocalPasswordReset(email)));
  assert.equal(mail.length, 1);
  assert.deepEqual(await requestLocalPasswordReset("unknown@example.test"), {});
  assert.deepEqual(await requestLocalPasswordReset("unknown@example.test"), {});
  assert.equal((await query("select * from public.app_password_reset_requests")).rowCount, 2);
});

test("three mails per hour maximum; a later request invalidates the previous token", async () => {
  await requestLocalPasswordReset(email);
  const originalToken = mail[0].token;
  for (let i = 0; i < 3; i++) {
    await query("update public.app_password_reset_requests set last_requested_at = now() - interval '3 minutes'");
    await requestLocalPasswordReset(email);
  }
  assert.equal(mail.length, 3);
  assert.ok((await completeLocalPasswordReset(originalToken, "new-password")).error);
  await query("update public.app_password_reset_requests set last_requested_at = now() - interval '61 minutes', window_started_at = now() - interval '61 minutes'");
  await requestLocalPasswordReset(email);
  assert.equal(mail.length, 4);
});

test("successful reset is single-use, preserves 2FA/role and revokes sessions, devices and challenges", async () => {
  await requestLocalPasswordReset(email);
  for (const table of ["app_sessions", "app_trusted_devices"]) {
    await query(`insert into public.${table} (token_hash, user_id, expires_at) values ('old', $1, now() + interval '1 hour')`, [userId]);
  }
  await query("insert into public.app_2fa_challenges (token_hash, user_id, mode, expires_at) values ('challenge', $1, 'verify', now() + interval '1 hour')", [userId]);
  const response = await confirmRoute.POST(new Request("https://example.test/reset", {
    method: "POST", body: JSON.stringify({ token: mail[0].token, password: "updated-password" }),
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null, "reset must not create a login session");
  const profile = (await query("select * from public.profiles")).rows[0];
  const [, salt, digest] = profile.password_hash.split(":");
  assert.equal(scryptSync("updated-password", salt, 64).toString("hex"), digest);
  assert.equal(profile.two_factor_enabled, true);
  assert.equal(profile.two_factor_secret, "preserved-secret");
  assert.equal(profile.role, "consultant");
  for (const table of ["app_sessions", "app_trusted_devices", "app_2fa_challenges", "app_password_resets"]) {
    assert.equal((await query(`select * from public.${table}`)).rowCount, 0);
  }
  assert.ok((await completeLocalPasswordReset(mail[0].token, "another-password")).error);
});

test("concurrent confirmations cannot use one link twice", async () => {
  await requestLocalPasswordReset(email);
  const results = await Promise.all(["password-one", "password-two"].map((password) => completeLocalPasswordReset(mail[0].token, password)));
  assert.equal(results.filter((result) => !result.error).length, 1);
});

test("invalid, expired and changed-account tokens cannot change a password", async () => {
  assert.ok((await completeLocalPasswordReset("invalid", "new-password")).error);
  assert.ok((await completeLocalPasswordReset("a".repeat(64), "new-password")).error);
  await requestLocalPasswordReset(email);
  const token = mail[0].token;
  await query("update public.app_password_resets set expires_at = now() - interval '1 second'");
  assert.ok((await completeLocalPasswordReset(token, "new-password")).error);
  await query("update public.app_password_resets set expires_at = now() + interval '30 minutes'");
  const original = (await query("select password_hash from public.profiles")).rows[0].password_hash;
  await query("update public.profiles set password_hash = $1", [hashPassword("admin-changed-password")]);
  assert.ok((await completeLocalPasswordReset(token, "new-password")).error);
  await query("update public.profiles set password_hash = $1, email = 'changed@example.test'", [original]);
  assert.ok((await completeLocalPasswordReset(token, "new-password")).error);
});

test("password validation does not consume a valid token", async () => {
  await requestLocalPasswordReset(email);
  assert.ok((await completeLocalPasswordReset(mail[0].token, "short")).error);
  assert.ok((await completeLocalPasswordReset(mail[0].token, "a".repeat(1025))).error);
  assert.deepEqual(await completeLocalPasswordReset(mail[0].token, "valid-password"), {});
});

test("a database failure rolls back both token consumption and password update", async () => {
  await requestLocalPasswordReset(email);
  const original = (await query("select password_hash from public.profiles")).rows[0].password_hash;
  failSessionDelete = true;
  await assert.rejects(completeLocalPasswordReset(mail[0].token, "new-password"));
  assert.equal((await query("select password_hash from public.profiles")).rows[0].password_hash, original);
  assert.equal((await query("select * from public.app_password_resets")).rowCount, 1);
});

test("failed mail removes its token without revealing account existence", async (t) => {
  const log = t.mock.method(console, "error", () => undefined);
  mailFails = true;
  assert.deepEqual(await requestLocalPasswordReset(email), {});
  assert.equal((await query("select * from public.app_password_resets")).rowCount, 0);
  assert.equal(log.mock.calls.length, 1);
  assert.ok(!JSON.stringify(log.mock.calls[0].arguments).includes(email));
});

test("local recovery is disabled when another auth provider is configured", async () => {
  selfHosted = false;
  await assert.rejects(requestLocalPasswordReset(email));
  await assert.rejects(completeLocalPasswordReset("a".repeat(64), "valid-password"));
});

test("mail uses the configured HTTPS origin, a fragment token and a styled button", async (t) => {
  const oldUrl = process.env.SALES_PUBLIC_URL;
  process.env.SALES_PUBLIC_URL = "https://sales.example.test";
  t.after(() => { if (oldUrl === undefined) delete process.env.SALES_PUBLIC_URL; else process.env.SALES_PUBLIC_URL = oldUrl; });
  let message;
  const mailModule = loader({ "node:child_process": { spawn: () => {
    const child = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.end = (value) => { message = value; queueMicrotask(() => child.emit("close", 0)); };
    return child;
  } } })("@/lib/password-reset-email");
  await mailModule.sendPasswordResetEmail(email, "a".repeat(64));
  const parts = [...message.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n\r\n--/g)]
    .map((match) => Buffer.from(match[1], "base64").toString("utf8"));
  assert.equal(parts.length, 2);
  for (const part of parts) assert.ok(part.includes("https://sales.example.test/reset-password#recovery_token="));
  assert.ok(parts[1].includes("Nieuw wachtwoord instellen"));
  await assert.rejects(mailModule.sendPasswordResetEmail("victim@example.test\r\nBcc: other@example.test", "token"));
  process.env.SALES_PUBLIC_URL = "http://sales.example.test";
  await assert.rejects(mailModule.sendPasswordResetEmail(email, "token"));
});
