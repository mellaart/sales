const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const crypto = require('node:crypto');
function load(file, deps = {}) {
  const m = { exports: {} };
  new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(m, m.exports, n => { if (n in deps) return deps[n]; throw Error(n); });
  return m.exports;
}
test('return-pin SMS gates reads and acceptance and binds access to phone and form version', async () => {
  const originalKey = process.env.SALES_CUSTOMER_FORM_SIGNING_KEY;
  process.env.SALES_CUSTOMER_FORM_SIGNING_KEY = 'sms-test-only';
  try {
    const row = { id: 'form', project_id: 'project', version: 1, token_version: 1, status: 'open', mobile_phone: '31612345678', sms_verify_id: 'challenge', expires_at: new Date(Date.now() + 86400000).toISOString(), form_data: {}, relation_name: 'Test' };
    let required = true, sends = 0, verified = 0;
    const db = async sql => {
      if (sql.includes('set sms_verify_id = null')) row.sms_verify_id = null;
      return { rows: [row] };
    };
    const api = load('lib/worldline-return-pin-server.ts', {
      'node:crypto': crypto,
      '@/lib/local-db': { query: db, withTransaction: fn => fn({ query: db }) },
      '@/lib/worldline': {},
      '@/lib/worldline-return-pin': load('lib/worldline-return-pin.ts'),
      '@/lib/customer-sms-settings': { isCustomerSmsRequired: async () => required },
      '@/lib/messagebird-verify': {
        normalizeMessageBirdMobileNumber: s => s, maskMessageBirdMobileNumber: () => 'masked',
        startMessageBirdSmsVerification: async () => { sends++; return { id: 'new' }; },
        verifyMessageBirdSmsCode: async (id, code) => { if (code !== '123456') throw Error('invalid code'); verified++; },
      },
    });
    const token = crypto.createHmac('sha256', 'sms-test-only').update('smart-trade-worldline-return-pin:form:1').digest('base64url');
    const blocked = await api.getPublicWorldlineReturnPinForm('form', 1, token);
    assert.equal(blocked.verificationRequired, true);
    assert.equal(blocked.form, undefined);
    assert.equal((await api.acceptPublicWorldlineReturnPinForm(new Request('https://example.test'), 'form', 1, token, {}, true)).error, 'Verifieer eerst uw toegang met de sms-code.');
    await assert.rejects(api.returnPinSmsAction('form', 1, 'invalid', 'send', ''));
    assert.equal(sends, 0);
    row.sms_verify_sent_at = new Date().toISOString();
    await assert.rejects(api.returnPinSmsAction('form', 1, token, 'send', ''), /Wacht/);
    assert.equal(sends, 0);
    await assert.rejects(api.returnPinSmsAction('form', 1, token, 'verify', '999999'), /invalid/);
    const success = await api.returnPinSmsAction('form', 1, token, 'verify', '123456');
    assert.equal(verified, 1);
    assert.ok((await api.getPublicWorldlineReturnPinForm('form', 1, token, success.deviceToken)).form);
    await assert.rejects(api.returnPinSmsAction('form', 1, token, 'verify', '123456'));
    row.mobile_phone = '31687654321';
    assert.equal((await api.getPublicWorldlineReturnPinForm('form', 1, token, success.deviceToken)).verificationRequired, true);
    required = false;
    assert.ok((await api.getPublicWorldlineReturnPinForm('form', 1, token)).form);
    row.status = 'revoked';
    assert.ok((await api.getPublicWorldlineReturnPinForm('form', 1, token)).error);
  } finally {
    if (originalKey === undefined) delete process.env.SALES_CUSTOMER_FORM_SIGNING_KEY;
    else process.env.SALES_CUSTOMER_FORM_SIGNING_KEY = originalKey;
  }
});
