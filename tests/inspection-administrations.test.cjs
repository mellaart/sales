const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
}
const { getInspectionAdministrationLines: lines, INSPECTION_ADMINISTRATION_ARTICLES: articles } = load('lib/inspection-administrations.ts');
const { buildDealAssetPlan } = load('lib/deal-assets.ts');
for (const [key, name, article] of [['starter','Starter',625], ['premium','Premium',624], ['enterprise','Enterprise',623], ['basic','Basic',622], ['lite','Lite',621]]) {
  test(`${name}: conversion preserves current package and article without support`, () => {
    const result = lines({key, name, supportExtra:10}, 15);
    assert.equal(articles[key], article);
    assert.equal(result.length, 1);
    assert.equal(result[0].label, `Smart Trade ${name} inkijk administratie`);
    assert.equal(result[0].quantity, 1);
    assert.equal(result[0].amount, 15);
    assert.ok(result[0].note.startsWith(`Artikel ${article}.`));
    const plan = buildDealAssetPlan({package_key:key, package_name:name, modules:[], calculator_inputs:{quoteLayout:'assets-expansion',assetsExpansion:{lines:result}}});
    assert.equal(plan.items.length, 0, 'conversion must not create an extra administration asset');
    assert.equal(plan.warnings.length, 1, 'conversion requires manual handling without a known asset class');
  });
}
test('rejects missing prices and unknown packages', () => {
  for (const price of [NaN, Infinity, -1]) assert.throws(() => lines({key:'starter',name:'Starter'}, price));
  assert.throws(() => lines({key:'unknown',name:'Unknown'}, 15));
  assert.equal(lines({key:'starter',name:'Starter'}, 0)[0].amount, 0);
});
