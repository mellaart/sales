const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const mod = { exports: {} };
  cache.set(file, mod.exports);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module', 'exports', 'require', js)(mod, mod.exports, name => name.startsWith('@/') ? load(name.slice(2) + '.ts') : require(name));
  return mod.exports;
}
const { getDealPriceSummary } = load('lib/deal-price-summary.ts');
const { DEFAULT_PRICE_CONFIG: config } = load('lib/price-config.ts');
const { EXTRA_ADMINISTRATION_MONTHLY_PRICES: prices } = load('lib/extra-administrations.ts');
for (const pkg of config.packages.filter(pkg => pkg.key !== 'lite')) {
  for (const includeSupport of [true, false]) {
    test(`${pkg.name}: saved quote totals include administrations, support=${includeSupport}`, () => {
      const deal = { package_key: pkg.key, total_users: 1, modules: [], calculator_inputs: { selectedPackage: pkg.key, includeSupport, includeTravelCosts: false } };
      const original = getDealPriceSummary(deal, config);
      const updated = getDealPriceSummary({...deal, calculator_inputs: {...deal.calculator_inputs, extraAdministrations: 3}}, config);
      const additional = 3 * prices[pkg.key] + (includeSupport ? 3 * pkg.supportExtra : 0);
      assert.ok(Math.abs(updated.monthlyTotal - original.monthlyTotal - additional) < 0.00001);
      assert.equal(updated.extraAdministrationsMonthly, additional);
      assert.equal(updated.implementationTotal, original.implementationTotal);
    });
  }
}
