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
for (const [key, name, article, assetClass] of [['starter','Starter',625,193], ['premium','Premium',624,192], ['enterprise','Enterprise',623,194], ['basic','Basic',622,190], ['lite','Lite',621,191]]) {
  test(`${name}: conversion preserves current package and article without support`, () => {
    const result = lines({key, name, supportExtra:10}, 15);
    assert.equal(articles[key], article);
    assert.equal(result.length, 1);
    assert.equal(result[0].label, `Smart Trade ${name} inkijk administratie`);
    assert.equal(result[0].quantity, 1);
    assert.equal(result[0].amount, 15);
    assert.ok(result[0].note.startsWith(`Artikel ${article}.`));
    const plan = buildDealAssetPlan({package_key:key, package_name:name, modules:[], calculator_inputs:{quoteLayout:'assets-expansion',assetsExpansion:{lines:result}}});
    assert.equal(plan.items.length, 1);
    assert.equal(plan.items[0].assetClassId, assetClass);
    assert.equal(plan.warnings.length, 0);
    const namedLines = lines({key, name}, 15, 'Acme');
    const deal = {package_key:key, package_name:name, modules:[], calculator_inputs:{quoteLayout:'assets-expansion',assetsExpansion:{administrationName:'Acme',lines:namedLines}}};
    for (const administration of [undefined, 'Acme']) {
      const namedPlan = buildDealAssetPlan(deal, administration);
      assert.equal(namedPlan.items.length, 1);
      assert.equal(namedPlan.items[0].assetClassId, assetClass);
      assert.equal(namedPlan.items[0].name, `Smart Trade ${name} inkijk administratie (Acme)`);
      assert.equal(namedPlan.warnings.length, 0);
    }
  });
}
test('rejects missing prices and unknown packages', () => {
  for (const price of [NaN, Infinity, -1]) assert.throws(() => lines({key:'starter',name:'Starter'}, price));
  assert.throws(() => lines({key:'unknown',name:'Unknown'}, 15));
  assert.equal(lines({key:'starter',name:'Starter'}, 0)[0].amount, 0);
});

test('reads unique administration suffixes and ignores descriptive/numeric suffixes', () => {
  const { getAdministrationNames } = load('lib/inspection-administrations.ts');
  assert.deepEqual(getAdministrationNames([
    {name:'Smart Trade Starter licentie ( Acme )'},
    {name:'Smart Trade Starter support (acme) (2)'},
    {name:'Smart Trade Starter licentie (Beta)'},
    {name:'Smart Trade Starter (chauffeursmodule)'},
    {name:'Smart Trade Starter (123)'},
    {name:'Smart Trade Starter zonder administratie'},
  ]), ['Acme', 'Beta']);
  assert.deepEqual(getAdministrationNames([]), []);
});

test('includes the administration in the quote line persisted to the deal', () => {
  const result = lines({key:'starter',name:'Starter'}, 19.2, '  Acme   Noord  ');
  assert.equal(result[0].label, 'Smart Trade Starter inkijk administratie (Acme Noord)');
  assert.equal(result[0].amount, 19.2);
  assert.equal(result.length, 1);
});

test('does not map an inspection conversion to a different package or multiple assets', () => {
  for (const line of [lines({key:'enterprise',name:'Enterprise'}, 15)[0], {...lines({key:'starter',name:'Starter'}, 15)[0],quantity:2}]) {
    const plan = buildDealAssetPlan({package_key:'starter',package_name:'Starter',modules:[],calculator_inputs:{quoteLayout:'assets-expansion',assetsExpansion:{lines:[line]}}});
    assert.equal(plan.items.length, 0);
    assert.equal(plan.warnings.length, 1);
  }
});
