const assert = require("node:assert/strict");
const { before, beforeEach, after, test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");
const db = new PGlite();
const root = resolve(__dirname, "..");
let schema;
let dealId;
let implementationId;

before(async () => {
  const source = ts.createSourceFile("db.ts", readFileSync(resolve(root, "lib/local-db.ts"), "utf8"), ts.ScriptTarget.Latest);
  function visit(node) {
    if (ts.isNoSubstitutionTemplateLiteral(node) && node.text.includes("create table if not exists public.profiles")) schema = node.text;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(schema);
  schema = schema.replace("create extension if not exists pgcrypto;", "");
  await db.exec(schema);
});
beforeEach(async () => {
  await db.exec("truncate public.profiles cascade");
  const user = (await db.query("insert into public.profiles (email) values ('test@example.test') returning id")).rows[0].id;
  dealId = (await db.query("insert into public.deals (user_id) values ($1) returning id", [user])).rows[0].id;
  implementationId = (await db.query("insert into public.implementations (deal_id, customer_name) values ($1, 'Testklant') returning id", [dealId])).rows[0].id;
});
after(() => db.close());
const status = (value) => db.query("update public.implementations set status = $1 where id = $2", [value, implementationId]);
const archivedAt = async () => (await db.query("select archived_at from public.deals where id = $1", [dealId])).rows[0].archived_at;

test("cancelling archives only the linked deal and keeps the implementation", async () => {
  const other = (await db.query("insert into public.deals (user_id) select user_id from public.deals where id = $1 returning id", [dealId])).rows[0].id;
  await status("cancelled");
  assert.ok(await archivedAt());
  assert.equal((await db.query("select archived_at from public.deals where id = $1", [other])).rows[0].archived_at, null);
  assert.equal((await db.query("select status from public.implementations where id = $1", [implementationId])).rows[0].status, "cancelled");
});

test("all previous statuses remain valid and do not archive deals", async () => {
  for (const value of ["new", "assigned", "planned", "in_progress", "waiting_customer", "completed"]) {
    await status(value);
    assert.equal(await archivedAt(), null);
  }
  await db.exec(schema);
  await db.exec(readFileSync(resolve(root, "supabase/implementation-cancellation.sql"), "utf8"));
  assert.equal((await db.query("select status from public.implementations where id = $1", [implementationId])).rows[0].status, "completed");
  assert.equal(await archivedAt(), null);
});

test("repeated cancellation preserves the archive date; reopening never silently unarchives", async () => {
  await db.query("update public.deals set archived_at = '2025-01-01T00:00:00Z' where id = $1", [dealId]);
  const original = await archivedAt();
  await status("cancelled");
  assert.deepEqual(await archivedAt(), original);
  await status("planned");
  assert.deepEqual(await archivedAt(), original);
});

test("status change and archive roll back together", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    await tx.query("update public.implementations set status = 'cancelled' where id = $1", [implementationId]);
    throw new Error("rollback");
  }));
  assert.equal(await archivedAt(), null);
  assert.equal((await db.query("select status from public.implementations where id = $1", [implementationId])).rows[0].status, "new");
});

test("cancelled implementations are not active", () => {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(resolve(root, "lib/implementations.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function("module", "exports", code)(module, module.exports);
  assert.equal(module.exports.IMPLEMENTATION_STATUS_LABELS.cancelled, "Geannuleerd");
  assert.equal(module.exports.isActiveImplementation("cancelled"), false);
  assert.equal(module.exports.isActiveImplementation("completed"), false);
  assert.equal(module.exports.isActiveImplementation("planned"), true);
});

test("overview excludes cancelled results even when searched or filtered explicitly", () => {
  const source = ts.createSourceFile("dashboard.tsx", readFileSync(resolve(root, "components/implementation-dashboard.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "filteredImplementations") {
      callback = node.initializer.arguments[0].getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(callback);
  const rows = ["new", "assigned", "planned", "in_progress", "waiting_customer", "completed", "cancelled"].map(status => ({ status, customer_name: "Testklant" }));
  const run = new Function("implementations", "statusFilter", "query", "consultantFilter", "planningFilter", "getLocalDateKey", "getImplementationDateKey", "isActiveImplementation", `return (${callback})();`);
  const filter = (status, query = "") => run(rows, status, query, "all", "all", () => "2026-09-07", () => "", value => !["completed", "cancelled"].includes(value));
  assert.deepEqual(filter("all").map(row => row.status), rows.slice(0, -1).map(row => row.status));
  assert.equal(filter("all", "Testklant").length, 6);
  assert.equal(filter("cancelled").length, 0);
  assert.equal(filter("completed").length, 1);
});

test("home dashboard total excludes cancelled implementations but includes completed ones", () => {
  const source = ts.createSourceFile("dashboard.tsx", readFileSync(resolve(root, "components/home-dashboard.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "implementationStats") {
      callback = node.initializer.arguments[0].getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(callback);
  const run = new Function("implementations", "getLocalDateKey", "getImplementationDateKey", "isActiveImplementation", `return (${callback})();`);
  const stats = (rows) => run(rows, () => "2026-09-07", value => value, value => !["completed", "cancelled"].includes(value));
  const rows = [
    { status: "planned", planned_go_live_date: "2026-09-01" },
    { status: "completed" },
    { status: "cancelled", planned_go_live_date: "2026-09-01" },
    { status: "cancelled" },
  ];
  assert.equal(stats(rows).total, 2);
  assert.equal(stats(rows).active, 1);
  assert.equal(stats(rows).overdue.length, 1);
  assert.equal(stats(rows).withoutDate.length, 0);
  assert.equal(stats([]).total, 0);
  assert.equal(stats([{ status: "cancelled" }]).total, 0);
});
