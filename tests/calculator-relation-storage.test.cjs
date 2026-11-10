const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('lib/deal-storage.ts', 'utf8') + '\nexport { toSupabaseDealPayload };';
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', compiled)(mod, mod.exports);

test('offline deal synchronization preserves the selected existing customer', () => {
  const payload = mod.exports.toSupabaseDealPayload({
    id: 'local-deal-test', customer_name: 'Bestaande klant',
    smart_trade_relation_id: 42, customer_email: 'klant@example.test',
    calculator_inputs: { quoteLayout: 'standard', assetsExpansion: null },
  }, 'user-test');
  assert.equal(payload.smart_trade_relation_id, 42);
  assert.equal(payload.customer_name, 'Bestaande klant');
  assert.equal(payload.customer_email, 'klant@example.test');
  assert.equal(payload.calculator_inputs.quoteLayout, 'standard');
});

test('new customer deals remain without an existing relation link', () => {
  const payload = mod.exports.toSupabaseDealPayload({ id: 'local-deal-new', customer_name: 'Nieuwe klant' }, 'user-test');
  assert.equal(payload.smart_trade_relation_id, null);
});
