const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(readFileSync('lib/deal-assets.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(mod, mod.exports);
const { buildDealAssetPlan } = mod.exports;
const labels = ['Suite MKB koppeling', 'Mailchimp', 'Power BI', 'Leverschema'];
const line = (label, quantity = 1) => ({ group: 'Modules', label, quantity, cadence: 'monthly' });
const expansion = (packageKey, lines) => ({
  package_key: packageKey, package_name: 'Uitbreiding', modules: [],
  calculator_inputs: { quoteLayout: 'assets-expansion', assetsExpansion: { lines } },
});

for (const [pkg, ids] of Object.entries({
  lite: [351, 126, 127, 404], starter: [350, 140, 141, 406],
  basic: [349, 154, 155, 407], premium: [348, 168, 169, 408], enterprise: [347, 182, 183, 409],
})) {
  test(`${pkg}: each standalone module uses the existing package and retains its creation key`, () => {
    for (const [index, label] of labels.entries()) {
      const plan = buildDealAssetPlan(expansion(pkg, [line(label, 2)]));
      assert.deepEqual(plan.items.map(item => item.assetClassId), [ids[index], ids[index]]);
      assert.deepEqual(plan.items.map(item => item.key), ['expansion-0:1', 'expansion-0:2']);
      assert.deepEqual(plan.warnings, []);
    }
  });
  test(`${pkg}: existing combined quotes produce four separate assets without base licences`, () => {
    const deal = expansion(pkg, [line(`Module-uitbreiding: ${labels.join(', ')}`)]);
    const plan = buildDealAssetPlan(deal);
    assert.deepEqual(plan.items.map(item => item.assetClassId), ids);
    assert.equal(new Set(plan.items.map(item => item.key)).size, 4);
    assert.deepEqual(plan.warnings, []);
    assert.deepEqual(buildDealAssetPlan(deal), plan);
  });
}

test('PostNL remains manual without blocking the supported modules', () => {
  const plan = buildDealAssetPlan(expansion('basic', [line('Module-uitbreiding: Suite MKB koppeling, PostNL, Mailchimp')]));
  assert.deepEqual(plan.items.map(item => item.assetClassId), [349, 154]);
  assert.equal(plan.warnings.length, 1);
  assert.match(plan.warnings[0], /^PostNL:/);
});

test('one-time setup costs and package changes do not generate module assets', () => {
  const plan = buildDealAssetPlan(expansion('basic', [
    { ...line('Suite MKB koppeling'), cadence: 'once' },
    { ...line('Pakketadvies: Smart Trade Basic naar Premium'), group: 'Pakket' },
  ]));
  assert.deepEqual(plan.items, []);
  assert.equal(plan.warnings.length, 1);
});

test('invalid quantities and unknown packages never generate module assets', () => {
  for (const quantity of [0, -1, 1.5, 1001, 'invalid']) {
    const plan = buildDealAssetPlan(expansion('basic', [line('Suite MKB koppeling', quantity)]));
    assert.deepEqual(plan.items, []);
    assert.equal(plan.warnings.length, 1);
  }
  assert.deepEqual(buildDealAssetPlan(expansion('unknown', [line('Suite MKB koppeling')])).items, []);
});

test('regular Suite MKB sales still create their usual module asset', () => {
  const plan = buildDealAssetPlan({ package_key: 'basic', package_name: 'Basic',
    modules: [{ key: 'suiteMkb', qty: 1 }], calculator_inputs: {} });
  assert.equal(plan.items.filter(item => item.assetClassId === 349).length, 1);
  assert.deepEqual(plan.warnings, []);
});
