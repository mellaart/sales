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
for (const [key, name, id, supportClass, administrationClass] of [['lite','Lite',478,33,116], ['starter','Starter',605,25,118], ['basic','Basic',602,29,115], ['premium','Premium',604,21,117], ['enterprise','Enterprise',603,37,119]]) {
  test(`${name}: article, totals and assets with and without support`, () => {
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
    assert.equal(plan.items.length,6);
    assert.equal(plan.items.filter(item=>item.assetClassId===supportClass).length,3);
    assert.equal(plan.items.filter(item=>item.assetClassId===administrationClass).length,3);
    assert.equal(new Set(plan.items.map(item=>item.key)).size,6);
    assert.equal(plan.warnings.length,0);
    const withoutPlan = buildDealAssetPlan({package_key:key, package_name:name, modules:[], calculator_inputs:{quoteLayout:'assets-expansion',assetsExpansion:{lines:without}}});
    assert.equal(withoutPlan.items.length,3);
    assert.ok(withoutPlan.items.every(item=>item.assetClassId===administrationClass));
    assert.equal(withoutPlan.warnings.length,0);
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

for (const key of Object.keys(prices)) {
  test(`${key}: standard new customer quote creates extra administrations and optional support`, () => {
    const base = { package_key: key, package_name: key, modules: [], calculator_inputs: { quoteLayout: 'standard', extraAdministrations: 2, includeSupport: true } };
    const plan = buildDealAssetPlan(base);
    const added = plan.items.filter(item => item.source === 'Extra administratie');
    assert.equal(added.length, 4);
    assert.equal(new Set(plan.items.map(item => item.key)).size, plan.items.length);
    const noSupport = buildDealAssetPlan({...base, calculator_inputs: {...base.calculator_inputs, includeSupport: false}});
    assert.equal(noSupport.items.filter(item => item.source === 'Extra administratie').length, 2);
    const original = buildDealAssetPlan({...base, calculator_inputs: {quoteLayout: 'standard'}});
    assert.equal(original.items.filter(item => item.source === 'Extra administratie').length, 0);
  });
}

const { getExtraAdministrationQuoteRows } = load('lib/extra-administrations.ts');
test('named administrations appear separately on the quote, including their support', () => {
  const administrationLines = lines({key:'starter',name:'Starter',supportExtra:10},2,19.2,true);
  const rows = getExtraAdministrationQuoteRows(administrationLines, ['  Amsterdam  BV ', 'Rotterdam BV', 'Removed']);
  assert.equal(rows.length,4);
  assert.ok(rows[0].description.endsWith('(Amsterdam BV)'));
  assert.ok(rows[1].description.endsWith('(Rotterdam BV)'));
  assert.ok(rows[2].description.endsWith('(Amsterdam BV)'));
  assert.ok(rows[3].description.endsWith('(Rotterdam BV)'));
  assert.ok(rows.every(row=>row.amount==='1x' && !row.description.includes('Removed')));
  assert.equal(rows.reduce((sum,row)=>sum+row.total,0),58.4);
  assert.equal(getExtraAdministrationQuoteRows(administrationLines, []).length,2);
  assert.ok(getExtraAdministrationQuoteRows(administrationLines, ['Amsterdam'])[1].description.endsWith('(Administratie 2)'));
});

test('each extra administration and support asset uses its own name instead of the main administration', () => {
  const deal = {package_key:'starter',package_name:'Starter',modules:[],calculator_inputs:{extraAdministrations:2,extraAdministrationNames:['  Amsterdam  BV ', 'Rotterdam BV'],includeSupport:true}};
  for (const mainName of [undefined, 'Hoofdadministratie']) {
    const plan=buildDealAssetPlan(deal,mainName);
    for (const prefix of ['extra-administration','support-extra-administration']) {
      assert.ok(plan.items.find(item=>item.key===`${prefix}:1`).name.endsWith('(Amsterdam BV)'));
      assert.ok(plan.items.find(item=>item.key===`${prefix}:2`).name.endsWith('(Rotterdam BV)'));
    }
    const license=plan.items.find(item=>item.key==='license:1');
    assert.equal(license.name,`Smart Trade Starter licentie${mainName ? ` (${mainName})` : ''}`);
  }
  const legacy=buildDealAssetPlan({...deal,calculator_inputs:{extraAdministrations:1}},'Hoofdadministratie');
  assert.ok(legacy.items.find(item=>item.key==='extra-administration:1').name.endsWith('(Hoofdadministratie)'));
});
