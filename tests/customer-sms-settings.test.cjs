const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");
const root = path.resolve(__dirname, "..");

function load(file, dependencies) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("module", "exports", "require", code)(module, module.exports, name => {
    assert.ok(name in dependencies, `Unexpected import: ${name}`);
    return dependencies[name];
  });
  return module.exports;
}

function portalFunction(name, dependencies) {
  const source = ts.createSourceFile("portal.ts", fs.readFileSync(path.join(root, "lib/implementation-portal-server.ts"), "utf8"), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === name);
  assert.ok(declaration);
  const code = ts.transpileModule(declaration.getText(source).replace(/^export /, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(dependencies), `${code}; return ${name};`)(...Object.values(dependencies));
}

test("SMS defaults to required; explicit off persists; invalid data and database errors never bypass SMS", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table app_settings (key text primary key, payload jsonb, updated_at timestamptz default now())");
    const settings = load("lib/customer-sms-settings.ts", { "@/lib/local-db": { query: (sql, values) => db.query(sql, values) } });
    assert.equal(await settings.isCustomerSmsRequired(), true);
    await settings.saveCustomerSmsRequired(false);
    assert.equal(await settings.isCustomerSmsRequired(), false);
    await settings.saveCustomerSmsRequired(true);
    assert.equal(await settings.isCustomerSmsRequired(), true);
    await db.exec(`update app_settings set payload = '{"enabled":"false"}'`);
    assert.equal(await settings.isCustomerSmsRequired(), true);
    await db.exec("drop table app_settings");
    await assert.rejects(settings.isCustomerSmsRequired());
  } finally { await db.close(); }
});

test("SMS off still requires a valid active secret link for all device-protected operations", async () => {
  for (const required of [true, false]) {
    for (const active of [true, false]) {
      for (const validToken of [true, false]) {
        const check = portalFunction("verifiedPortalAccess", {
          query: async () => ({ rows: [{ id: "access" }] }),
          accessIsActive: () => active,
          verifyImplementationPortalToken: () => validToken,
          isCustomerSmsRequired: async () => required,
          trustedPortalDevice: async () => false,
        });
        assert.equal(Boolean(await check("access", 1, "token", "")), active && validToken && !required);
      }
    }
  }
});

test("SMS off opens the page without mobile or provider; SMS on blocks missing mobile", async () => {
  for (const required of [true, false]) {
    const check = portalFunction("getImplementationPortalSmsVerificationStatus", {
      verifiedPortalAccess: async () => ({ id: "access", mobile_phone: null }),
      isCustomerSmsRequired: async () => required,
    });
    const result = await check("access", 1, "token", "");
    assert.equal(result.ok, !required);
    if (!required) assert.equal(result.verified, true);
  }
});

test("settings API rejects anonymous and consultant writes and validates admin input", async () => {
  let actor = { ok: false };
  let saved = true;
  const api = load("app/api/admin/settings/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => ({ body, ...init }) } },
    "@/lib/local-auth": { requireLocalUser: async () => actor },
    "@/lib/customer-sms-settings": {
      isCustomerSmsRequired: async () => saved,
      saveCustomerSmsRequired: async value => { saved = value; },
    },
  });
  const request = value => new Request("https://example.test/api/admin/settings", { method: "POST", body: JSON.stringify({ smsRequired: value }) });
  assert.equal((await api.POST(request(false))).status, 401);
  actor = { ok: true, profile: { role: "consultant" } };
  assert.equal((await api.POST(request(false))).status, 403);
  assert.equal(saved, true);
  actor.profile.role = "admin";
  assert.equal((await api.POST(request("false"))).status, 400);
  assert.equal((await api.POST(request(false))).status, 200);
  assert.equal(saved, false);
  assert.equal((await api.GET(request(false))).body.smsRequired, false);
});

test("creating a customer link without mobile is allowed only when SMS is off", async () => {
  for (const required of [true, false]) {
    let inserted = false;
    const create = portalFunction("createOrRefreshImplementationPortal", {
      requireImplementationAccess: async () => ({ ok: true }),
      isCustomerSmsRequired: async () => required,
      normalizeMessageBirdMobileNumber: value => value,
      query: async sql => {
        if (sql.includes("insert into")) { inserted = true; return { rows: [{ id: "new-access" }] }; }
        return { rows: [] };
      },
      createId: () => "new-access",
      IMPLEMENTATION_PORTAL_TTL_DAYS: 365,
      toAccess: (_request, row) => row,
    });
    const result = await create({}, "implementation", { user: { id: "admin" } }, false);
    assert.equal(result.ok, !required);
    assert.equal(inserted, !required);
  }
});
