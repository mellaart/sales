const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
const deps = {
  '@/lib/customer-intake': { combineCustomerContactName: (first, last) => [first, last].filter(Boolean).join(' ') },
  '@/lib/price-config': { DEFAULT_PRICE_CONFIG: { modules: [] } },
  '@/lib/pricing': { euro: new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }) },
};
new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync('lib/new-customer-email.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(mod, mod.exports, name => { assert.ok(name in deps, name); return deps[name]; });
const { getNewCustomerEmailMissingFields, buildNewCustomerEmail } = mod.exports;
const implementation = { customer_name: 'Voorbeeld', administration_name: 'voorbeeld', planned_go_live_date: '2026-11-01', financial_package: 'Exact' };
const intake = Object.fromEntries(['deliveryName', 'deliveryStreet', 'deliveryNumber', 'deliveryPostcode', 'deliveryCity', 'phone', 'chamberOfCommerceNumber', 'vatNumber'].map(key => [key, '']));

test('unassigned consultant does not block a complete customer email and renders the requested fallback', () => {
  for (const name of [undefined, null, '', '   ']) {
    const data = { ...implementation, assigned_consultant_name: name };
    assert.deepEqual(getNewCustomerEmailMissingFields({ implementation: data, intakeSubmitted: true }), []);
    assert.match(buildNewCustomerEmail({ implementation: data, deal: {}, intake }).htmlBody, /Nog geen consultant toegewezen/);
  }
});
test('assigned consultant is still included and HTML escaped', () => {
  const { htmlBody } = buildNewCustomerEmail({ implementation: { ...implementation, assigned_consultant_name: ' Anna & Piet ' }, deal: {}, intake });
  assert.match(htmlBody, /Anna &amp; Piet/);
  assert.doesNotMatch(htmlBody, /Nog geen consultant toegewezen/);
});
test('other customer email requirements still block sending', () => {
  assert.deepEqual(getNewCustomerEmailMissingFields({ implementation: { customer_name: 'Voorbeeld' }, intakeSubmitted: false }),
    ['ontvangen klantformulier', 'administratie', 'geplande livegang', 'financieel pakket']);
});
