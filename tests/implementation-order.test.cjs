const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('lib/implementation-order.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(mod, mod.exports);
const { getImplementationOrderBreakdown: breakdown } = mod.exports;
const line = (label, group = 'Modules') => ({ label, group, quantity: 1, cadence: 'monthly' });
const deal = lines => ({ package_name: 'Uitbreiding', modules: [{name: 'Bestaande module'}], implementation_total: 500,
  calculator_inputs: { assetsExpansion: { lines }, travelCostTotal: 100, travelCostPerDay: 50, travelRegion: 1 } });

test('each catalog module appears in both order text and reference', () => {
  const catalog = fs.readFileSync('lib/pricing.ts', 'utf8').split('export const MODULES:')[1].split('\n];')[0];
  const names = [...catalog.matchAll(/name: "([^"]+)"/g)].map(match => match[1]);
  assert.ok(names.length > 10);
  for (const name of names) {
    const result = breakdown(deal([line(name)]));
    assert.equal(result.description, `Implementatie ${name === 'Suite MKB koppeling' ? 'Suite MKB' : name}`);
    assert.equal(result.reference, result.description);
    assert.equal(result.implementationAmount, 400);
    assert.equal(result.travelAmount, 100);
    assert.equal(result.travelQuantity, 2);
    assert.equal(result.travelArticleId, 204);
  }
});
test('legacy combined modules and setup lines are deduplicated', () => {
  const value = deal([line('Module-uitbreiding: Suite MKB koppeling, Mailchimp'), line('Implementatie Suite MKB koppeling', 'Implementatie')]);
  value.calculator_inputs = JSON.stringify(value.calculator_inputs);
  assert.equal(breakdown(value).description, 'Implementatie Suite MKB, Mailchimp');
});
test('package changes name added modules from the quote note', () => {
  assert.equal(breakdown(deal([{...line('Pakketadvies: Basic naar Premium', 'Pakket'), note: 'Upgrade: Kassa, Power BI'}])).description, 'Implementatie Kassa, Power BI');
});
test('new sales use module names and ignore unselected modules', () => {
  assert.equal(breakdown({package_name: 'Basic', modules: JSON.stringify([{name: 'Suite MKB koppeling', qty: 1}, {name: 'Kassa', qty: 0}])}).description, 'Implementatie Suite MKB');
});
test('missing modules retain a useful package fallback without generic expansion wording', () => {
  assert.equal(breakdown({package_name:'Smart Trade Basic'}).description, 'Implementatie Basic');
  assert.equal(breakdown(deal([{...line('Kassa'), quantity: 0}])).description, 'Implementatie');
  assert.equal(breakdown({}).description, 'Implementatie');
});
