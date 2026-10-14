const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('app/api/outlook/drafts/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup({ failSend = false, permission = 'write', invalid = false } = {}) {
  const events = [];
  const dependencies = {
    '@/lib/local-auth': { requireLocalUser: async () => ({ ok: true, user: { id: 'user', user_metadata: {} }, profile: {} }) },
    '@/lib/worldline-access-server': { getLocalWorldlinePermission: async () => permission },
    '@/lib/worldline-return-pin-server': { getPublicWorldlineReturnPinForm: async () => invalid ? { error: 'invalid' } : { form: {} } },
    '@/lib/customer-intake-server': {},
    '@/lib/local-db': { query: async (sql, args) => { events.push({ sql, args }); return { rows: [] }; } },
    '@/lib/outlook-server': {
      createOutlookDraft: async () => { events.push('send'); if (failSend) throw new Error('send failed'); return 'sent'; },
      OutlookReconnectRequiredError: class extends Error {},
    },
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
  };
  const mod = { exports: {} };
  new Function('require', 'exports', code)(name => dependencies[name], mod.exports);
  return { events, run: (path = 'send') => mod.exports.POST(new Request(`https://example.test/api/outlook/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      template: 'worldline-return-pin', recipientEmail: 'customer@example.test',
      publicUrl: 'https://example.test/retourpinnen/12345678-1234-1234-1234-123456789abc?v=1&token=test',
    }),
  })) };
}
test('only a successful send updates the linked concept dossier', async () => {
  const c = setup();
  const result = await c.run();
  assert.equal(result.status, 201);
  assert.equal(result.body.projectStatusUpdated, true);
  assert.equal(c.events[0], 'send');
  assert.match(c.events[1].sql, /status = 'waiting_customer'/);
  assert.match(c.events[1].sql, /project.id = form.project_id and project.status = 'concept'/);
  assert.deepEqual(c.events[1].args, ['12345678-1234-1234-1234-123456789abc']);
});
test('drafts, rejected links, missing access and failed sends never change status', async () => {
  for (const options of [{ failSend: true }, { permission: 'read' }, { invalid: true }]) {
    const c = setup(options);
    await c.run();
    assert.ok(c.events.every(event => typeof event === 'string'));
  }
  const c = setup();
  await c.run('drafts');
  assert.deepEqual(c.events, ['send']);
});
