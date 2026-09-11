const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');

test('implementation view preferences persist per authenticated consultant, with validated writes', async () => {
  const db = new PGlite();
  try {
    await db.exec("create table app_settings (key text primary key, payload jsonb not null default '{}'::jsonb, updated_at timestamptz default now())");
    let actor = { ok: false };
    const dependencies = {
      'next/server': { NextResponse: { json: (body, init) => ({ body, ...init }) } },
      '@/lib/local-auth': { requireLocalUser: async () => actor },
      '@/lib/local-db': { query: (sql, values) => db.query(sql, values) },
    };
    const code = ts.transpileModule(fs.readFileSync('app/api/me/implementation-preferences/route.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    new Function('module', 'exports', 'require', code)(module, module.exports, name => {
      assert.ok(name in dependencies); return dependencies[name];
    });
    const { GET, POST } = module.exports;
    const request = body => new Request('https://example.test/api/me/implementation-preferences', { method: 'POST', body: JSON.stringify(body) });
    assert.equal((await GET(request({}))).status, 401);
    assert.equal((await POST(request({ appointmentsOpen: true }))).status, 401);
    actor = { ok: true, user: { id: 'consultant-a' } };
    assert.equal((await GET(request({}))).body.appointmentsOpen, true);
    assert.equal((await POST(request({ appointmentsOpen: 'true' }))).status, 400);
    assert.equal((await POST(request({ appointmentsOpen: true, userId: 'consultant-b' }))).status, 200);
    assert.equal((await GET(request({}))).body.appointmentsOpen, true);
    actor.user.id = 'consultant-b';
    assert.equal((await GET(request({}))).body.appointmentsOpen, true);
    await POST(request({ appointmentsOpen: true }));
    actor.user.id = 'consultant-a';
    await db.query("update app_settings set payload = payload || '{\"anotherSectionOpen\":true}'::jsonb where key = $1", ['implementation-preferences:consultant-a']);
    await POST(request({ appointmentsOpen: false }));
    const stored = await db.query('select payload from app_settings where key = $1', ['implementation-preferences:consultant-a']);
    assert.equal(stored.rows[0].payload.anotherSectionOpen, true);
    assert.equal((await GET(request({}))).body.appointmentsOpen, false);
    actor.user.id = 'consultant-b';
    assert.equal((await GET(request({}))).body.appointmentsOpen, true);
    const keys = ['appointmentsOpen', 'managementOpen', 'sharingOpen', 'filesOpen', 'dnsOpen', 'tasksOpen'];
    actor.user.id = 'consultant-c';
    const defaults = Object.fromEntries(keys.map(key => [key, true]));
    assert.deepEqual((await GET(request({}))).body, defaults);
    for (const key of keys) {
      assert.equal((await POST(request({ [key]: false }))).status, 200);
      assert.deepEqual((await GET(request({}))).body, { ...defaults, [key]: false });
      await POST(request({ [key]: true }));
    }
    // Concurrent updates to different sections must not overwrite one another.
    await Promise.all(keys.map(key => POST(request({ [key]: false }))));
    assert.deepEqual((await GET(request({}))).body, Object.fromEntries(keys.map(key => [key, false])));
    assert.equal((await POST(request({ dnsOpen: true, tasksOpen: 'false' }))).status, 400);
    assert.equal((await POST(request({ unknownOpen: false }))).status, 400);
    assert.equal((await GET(request({}))).body.dnsOpen, false);
    actor.user.id = 'consultant-b';
    assert.deepEqual((await GET(request({}))).body, defaults);
    await db.exec('drop table app_settings');
    assert.equal((await GET(request({}))).status, 500);
    assert.equal((await POST(request({ appointmentsOpen: false }))).status, 500);
  } finally { await db.close(); }
});
