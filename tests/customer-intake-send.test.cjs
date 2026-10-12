const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function setup({ sent = null, submitted = null, failure = false, allowed = true } = {}) {
  let sends = 0, saves = 0;
  const intake = { id: 'intake', publicUrl: 'https://example.test/klantgegevens/intake?token=test', invitationSentAt: sent, submittedAt: submitted };
  const deps = {
    'next/server': { NextResponse: Response },
    '@/lib/local-auth': { requireLocalUser: async () => ({ ok: true, user: { id: 'user', user_metadata: {} }, profile: {} }) },
    '@/lib/customer-intake-server': {
      requireAccessibleCalculatorDeal: async () => ({ ok: allowed, error: 'Geen toegang' }),
      getCustomerIntakeForDeal: async () => ({ intake }),
    },
    '@/lib/local-db': { query: async () => { saves++; intake.invitationSentAt = '2026-10-12T12:00:00Z'; return { rows: [{ invitation_sent_at: intake.invitationSentAt }] }; } },
    '@/lib/outlook-server': {
      createOutlookDraft: async () => { sends++; if (failure) throw new Error('Verzenden mislukt'); return 'https://outlook.office.com/mail/sentitems'; },
      OutlookReconnectRequiredError: class extends Error {},
    },
  };
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync('app/api/outlook/drafts/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(mod, mod.exports, key => { assert.ok(key in deps, key); return deps[key]; });
  return {
    send: (mode = 'send') => mod.exports.POST(new Request(`https://example.test/api/outlook/${mode}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ template: 'customer-intake', dealId: 'deal', recipientEmail: 'klant@example.test', publicUrl: intake.publicUrl }),
    })),
    counts: () => ({ sends, saves }),
  };
}
test('successful intake sending persists the timestamp and blocks a subsequent request', async () => {
  const c = setup(); const response = await c.send();
  assert.equal(response.status, 201);
  assert.equal((await response.json()).invitationSentAt, '2026-10-12T12:00:00Z');
  assert.equal((await c.send()).status, 409);
  assert.deepEqual(c.counts(), { sends: 1, saves: 1 });
});
test('received forms and inaccessible deals cannot be sent', async () => {
  for (const options of [{ submitted: '2026-10-12' }, { sent: '2026-10-12' }, { allowed: false }]) {
    const c = setup(options); assert.ok((await c.send()).status >= 400);
    assert.deepEqual(c.counts(), { sends: 0, saves: 0 });
  }
});
test('failed sends and drafts never mark the form as sent', async () => {
  const failed = setup({ failure: true }); assert.equal((await failed.send()).status, 500);
  assert.deepEqual(failed.counts(), { sends: 1, saves: 0 });
  const draft = setup(); assert.equal((await draft.send('drafts')).status, 201);
  assert.deepEqual(draft.counts(), { sends: 1, saves: 0 });
});
