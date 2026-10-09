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
const { getExtraAdministrationLines: lines, EXTRA_ADMINISTRATION_ARTICLES: articles, EXTRA_ADMINISTRATION_MONTHLY_PRICES: prices } = load('lib/extra-administrations.ts');
const { buildDealAssetPlan } = load('lib/deal-assets.ts');
for (const [key, name, id, supportClass] of [['lite','Lite',478,33], ['starter','Starter',605,25], ['basic','Basic',602,29], ['premium','Premium',604,21], ['enterprise','Enterprise',603,37]]) {
  test(`${name}: article, totals and one support asset per administration`, () => {
    const pkg = { key, name, supportExtra: 10 };
    assert.equal(articles[key], id);
    assert.deepEqual(lines(pkg,0,NaN,true), []);
    const without = lines(pkg,3,25,false);
    assert.equal(without.length,1);
    assert.equal(without[0].amount,75);
    assert.equal(without[0].note,`Artikel ${id}`);
    const withSupport = lines(pkg,3,25,true);
    assert.equal(withSupport.length,2);
    assert.equal(withSupport[1].quantity,3);
    assert.equal(withSupport[1].amount,30);
    const plan = buildDealAssetPlan({package_key:key, package_name:name, modules:[], calculator_inputs:{quoteLayout:'assets-expansion',assetsExpansion:{lines:withSupport}}});
    assert.equal(plan.items.length,3);
    assert.ok(plan.items.every(item=>item.assetClassId===supportClass));
    // Article references must never be guessed to be asset class IDs.
    assert.equal(plan.warnings.length,1);
    assert.equal(lines({...pkg,supportExtra:0},2,0,true).length,2);
  });
}
test('rejects missing prices and invalid quantities', () => {
  const pkg={key:'lite',name:'Lite',supportExtra:5};
  for(const price of [NaN,Infinity,-1]) assert.throws(()=>lines(pkg,1,price,true));
  for(const qty of [-1,1.5,Infinity,1001]) assert.throws(()=>lines(pkg,qty,25,true));
});

test('uses the confirmed monthly article prices for all packages', () => {
  assert.deepEqual(prices, {starter:19.20,premium:34.15,enterprise:40.30,basic:27.95,lite:12.90});
  for (const [key, price] of Object.entries(prices)) {
    const result = lines({key,name:key,supportExtra:5},2,price,true);
    assert.equal(result[0].amount,2*price);
    assert.equal(result[1].amount,10);
  }
});
