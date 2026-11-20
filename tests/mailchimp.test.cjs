const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const ts = require('typescript');
const compiled = ts.transpileModule(readFileSync(resolve(__dirname, '../lib/mailchimp.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', compiled)(require, mod, mod.exports);
const { buildMailchimpPreview, synchronizeMailchimp } = mod.exports;
const contact = (email) => ({ email, company: 'Example', tags: ['Customer'], relationIds: ['1'], sources: ['relation'], conflict: false });
const source = { contacts: ['archived@example.test', 'existing@example.test', 'new@example.test', 'invalid@example.test'].map(contact), tags: ['Customer'], contactPersonErrorCount: 0 };
const settings = { audienceId: 'audience', managedTags: ['Customer'], previousEmails: [], lastSyncAt: null, lastSyncResult: { failures: [{ email: 'invalid@example.test', error: 'Please provide a valid email address.' }] } };
test('archived contacts are paginated and blocked; real new contacts still sync; failures are visible', async () => {
  const oldFetch = global.fetch;
  const oldKey = process.env.MAILCHIMP_API_KEY;
  process.env.MAILCHIMP_API_KEY = 'test-us1';
  const writes = [];
  const archivedOffsets = [];
  global.fetch = async (url, init = {}) => {
    const u = new URL(url);
    let body;
    if (init.method === 'PUT' || init.method === 'POST') {
      writes.push({ url: u.pathname, body: JSON.parse(init.body) });
      body = {};
    } else if (u.pathname.endsWith('/merge-fields')) body = { merge_fields: [{ tag: 'COMPANY' }] };
    else if (u.pathname.endsWith('/members')) {
      const archived = u.searchParams.get('status') === 'archived';
      const offset = Number(u.searchParams.get('offset'));
      if (archived) archivedOffsets.push(offset);
      const email = archived ? (offset ? 'archived@example.test' : 'other@example.test') : 'existing@example.test';
      body = { total_items: archived ? 2 : 1, members: [{ email_address: email, status: archived ? 'archived' : 'subscribed', merge_fields: { COMPANY: 'Example' }, tags: [{ name: 'Customer' }] }] };
    } else body = { lists: [{ id: 'audience', name: 'Customers' }] };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  try {
    const preview = await buildMailchimpPreview(source, settings);
    assert.deepEqual(preview.contacts.map(c => c.state), ['blocked', 'unchanged', 'new', 'failed']);
    assert.equal(preview.contacts[0].mailchimpStatus, 'archived');
    assert.equal(preview.contacts[3].syncError, 'Please provide a valid email address.');
    assert.equal(preview.counts.new, 1);
    assert.equal(preview.counts.failed, 1);
    assert.deepEqual(archivedOffsets, [0, 1]);
    const result = await synchronizeMailchimp(source, settings);
    assert.equal(result.blocked, 1);
    assert.equal(result.unchanged, 1);
    assert.equal(result.created, 2);
    assert.deepEqual(writes.filter(w => w.body.email_address).map(w => w.body.email_address).sort(), ['invalid@example.test', 'new@example.test']);
    assert.ok(writes.filter(w => w.body.email_address).every(w => w.body.status_if_new === 'subscribed' && !('status' in w.body)));
  } finally {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.MAILCHIMP_API_KEY; else process.env.MAILCHIMP_API_KEY = oldKey;
  }
});
