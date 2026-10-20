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

const { getImplementationModuleOrders: moduleOrders } = mod.exports;
const setup = (name, amount, requiresTravel) => ({...line(`Implementatie ${name}`, 'Implementatie'), cadence:'once',amount,requiresTravel});
const moduleDeal = (lines, travel = 0, extra = {}) => ({
 package_name:'Uitbreiding',modules:[],
 implementation_total:lines.reduce((sum,row)=>sum+(row.amount||0),0)+travel,
 calculator_inputs:{assetsExpansion:{lines},travelCostTotal:travel,travelCostPerDay:50,travelRegion:1,...extra},
});
test('each module has its own order, remote modules never get travel',()=>{
 const orders=moduleOrders(moduleDeal([setup('Suite MKB koppeling',400,false),setup('Kassa',720,true)],50));
 assert.deepEqual(orders.map(o=>[o.reference,o.implementationAmount,o.travelAmount]),[
  ['Implementatie Suite MKB',400,0],['Implementatie Kassa',720,50],
 ]);
 assert.equal(orders[0].lines.length,1);
 assert.equal(orders[1].lines[1].article,204);
 assert.equal(orders.reduce((sum,o)=>sum+o.totalAmount,0),1170);
});
test('all remote modules produce separate orders without travel',()=>{
 const orders=moduleOrders(moduleDeal([setup('Mailchimp',360,false),setup('Suite MKB',400,false)]));
 assert.equal(orders.length,2);
 assert.ok(orders.every(o=>o.lines.length===1&&o.travelAmount===0));
});
test('saved module travel setting takes precedence over the current catalog',()=>{
 const value=moduleDeal([setup('Suite MKB koppeling',400,undefined),setup('Kassa',720,undefined)],50);
 value.modules=JSON.stringify([{key:'suiteMkb',name:'Suite MKB koppeling',requiresTravel:false},{key:'kassa',name:'Kassa',requiresTravel:true}]);
 const orders=moduleOrders(value,[{key:'suiteMkb',name:'Suite MKB koppeling',requiresTravel:true}]);
 assert.equal(orders[0].travelAmount,0);assert.equal(orders[1].travelAmount,50);
});
test('old quotes can resolve travel settings by module name from the catalog',()=>{
 const value=moduleDeal([setup('Mailchimp',360,undefined)]);
 assert.equal(moduleOrders(value,[{key:'mailchimp',name:'Mailchimp',requiresTravel:false}])[0].requiresTravel,false);
});
test('travel is never silently assigned to remote or unknown modules',()=>{
 assert.throws(()=>moduleOrders(moduleDeal([setup('Mailchimp',360,false)],50)),/geen module waarvoor een bezoek/);
 assert.throws(()=>moduleOrders(moduleDeal([setup('Onbekend',360,undefined)],50)),/reiskosteninstelling/);
});
test('rounding preserves the exact accepted total and invoice line totals',()=>{
 const value=moduleDeal([setup('A',100,true),setup('B',200,true),setup('C',300,true)],10,{implementationDayRate:3000});
 const orders=moduleOrders(value);
 assert.deepEqual(orders.map(o=>o.travelAmount),[1.67,3.33,5]);
 assert.equal(orders.reduce((sum,o)=>sum+o.totalAmount,0),610);
 for(const order of orders)assert.equal(order.lines.reduce((sum,l)=>sum+Number(l.price)*Number(l.quantity),0),order.totalAmount);
});
test('extra visits are separate and not added to a remote module',()=>{
 const orders=moduleOrders(moduleDeal([setup('Mailchimp',360,false)],100,{extraTravelVisits:2}));
 assert.equal(orders[0].travelAmount,0);assert.equal(orders[1].reference,'Reiskosten extra bezoeken');
 assert.equal(orders[1].totalAmount,100);
});
test('unassigned costs are preserved and discounts cannot silently change module amounts',()=>{
 const value=moduleDeal([setup('Kassa',720,false)]);value.implementation_total=800;
 const orders=moduleOrders(value);assert.equal(orders[1].reference,'Implementatie overige werkzaamheden');assert.equal(orders[1].totalAmount,80);
 value.implementation_total=600;assert.throws(()=>moduleOrders(value),/correctie/);
});
test('package-included setup is not billed twice and the base package stays separate',()=>{
 const value={package_name:'Basic',implementation_total:1500,calculator_inputs:{selectedPackage:'basic'},modules:[
  {name:'Kassa',key:'kassa',qty:1,setupCost:720,monthlyPrice:55,requiresTravel:true},
  {name:'Mailchimp',key:'mailchimp',qty:1,setupCost:360,monthlyPrice:30,noPackageSwitch:true,requiresTravel:false},
 ]};
 const orders=moduleOrders(value,[],[{key:'basic',name:'Basic',includedModules:1}]);
 assert.deepEqual(orders.map(o=>[o.reference,o.implementationAmount]),[['Implementatie Mailchimp',360],['Implementatie Basic',1140]]);
});
test('multiple legacy modules without module amounts cannot create a combined order',()=>{
 const value=moduleDeal([line('Module-uitbreiding: Suite MKB koppeling, Mailchimp')]);value.implementation_total=760;
 assert.throws(()=>moduleOrders(value),/afzonderlijke implementatiebedragen/);
});
test('travel is calculated per module, not redistributed from an incorrect total',()=>{
 const value=moduleDeal([setup('Suite MKB',400,false),setup('Kassa',720,true)],100);
 assert.throws(()=>moduleOrders(value),/reiskosten per module sluiten niet aan/);
});
test('the quoted day rate is retained when current pricing changes',()=>{
 const value=moduleDeal([setup('Kassa',720,true)],50,{implementationDayRate:720});
 assert.equal(moduleOrders(value,[],[],900)[0].travelAmount,50);
});
