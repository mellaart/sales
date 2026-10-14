const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, deps = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('module', 'exports', 'require', code)(mod, mod.exports, name => {
    assert.ok(name in deps, name);
    return deps[name];
  });
  return mod.exports;
}
const roles = load('lib/role-tabs.ts');
const persisted = { support: { assets: 'read', deals: 'read', prices: 'read', postcode: 'read' } };

test('existing settings gain an independently configurable Support Plus role', () => {
  const access = roles.normalizeRoleTabAccess(persisted);
  assert.ok(roles.USER_ROLES.includes('support_plus'));
  assert.equal(roles.ROLE_LABELS.support_plus, 'Support Plus');
  assert.equal(access.support.assets, 'read');
  assert.equal(access.support.deals, 'read');
  assert.equal(access.support_plus.assets, 'write');
  assert.equal(access.support_plus.deals, 'write');
  assert.equal(access.support_plus.prices, 'read');
  for (const tab of ['admin', 'calculator', 'implementation', 'worldline', 'ccv', 'testen']) {
    assert.equal(access.support_plus[tab], 'none');
  }
  const customized = roles.normalizeRoleTabAccess({ ...access, support_plus: { ...access.support_plus, assets: 'read' } });
  assert.equal(customized.support_plus.assets, 'read');
});

test('Support Plus can save an asset quote while Support remains read-only', async () => {
  let writes = 0;
  const table = load('lib/local-table.ts', {
    '@/lib/implementation-assets-progress': {},
    '@/lib/local-db': { query: async () => { writes++; return { rows: [{ id: 'quote' }] }; } },
    '@/lib/local-auth': { isLocalAdmin: () => false },
    '@/lib/protected-admin': { isProtectedAdminEmail: () => false },
    '@/lib/role-tab-access-storage': { readLocalRoleTabAccess: async () => roles.normalizeRoleTabAccess(persisted) },
    '@/lib/role-tabs': roles,
  });
  const actor = role => ({ user: { id: 'user' }, profile: { role } });
  const quote = { table: 'deals', action: 'insert', payload: { customer_name: 'Test', calculator_inputs: { quoteLayout: 'assets-expansion' } }, single: true };
  assert.equal(table.toUserRole('support_plus'), 'support_plus');
  await assert.rejects(table.executeLocalTableQuery(quote, actor('support')), /geen schrijfrechten voor Assets/);
  assert.equal(writes, 0);
  assert.equal((await table.executeLocalTableQuery(quote, actor('support_plus'))).data.id, 'quote');
  assert.equal(writes, 1);
  await assert.rejects(table.executeLocalTableQuery({ ...quote, payload: { customer_name: 'Test' } }, actor('support_plus')), /geen schrijfrechten voor Calculator/);
  assert.equal(writes, 1);
});
