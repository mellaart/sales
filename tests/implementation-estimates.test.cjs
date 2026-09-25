const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function loader(overrides = {}) {
 const cache = {};
 const load = name => {
  if (name in overrides) return overrides[name];
  if (!name.startsWith('@/')) return require(name);
  if (cache[name]) return cache[name].exports;
  const m = cache[name] = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(name.replace('@/', '')+'.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('module','exports','require',code)(m,m.exports,load);
  return m.exports;
 };
 return load;
}
const load = loader();
const { estimateImplementation:estimate, activityBudgetKey:key, selectedEstimateItems } = load('@/lib/implementation-estimates');
const { normalizePricingConfig, normalizeActivityBudgets } = load('@/lib/price-config');
const { getConfiguredImplementationTasks } = load('@/lib/work-activities');
const { validateBudgetRows, weightedProgress } = load('@/lib/implementation-planning');
const items = [
 {key:'fixed',label:'Inrichten',days:1,unit:'',started:false},
 {key:'lists',label:'Prijslijsten',days:0.1,unit:'prijslijst',started:false},
];
test('1 versus 40 price lists changes estimate and allocation but preserves approved days', () => {
 const small = estimate(items,8,{},6);
 const large = estimate(items,8,{lists:{days:0,started:true,quantity:40}},6);
 assert.equal(small.rawDays,1.1); assert.equal(large.rawDays,5);
 assert.ok(large.rows.lists.days > small.rows.lists.days);
 assert.equal(large.rows.lists.quantity,40); assert.equal(large.rows.lists.started,true);
 assert.equal(validateBudgetRows(large.rows,8),true);
 assert.ok(Math.abs(large.rows.fixed.days+large.rows.lists.days-8)<1e-10);
 assert.ok(Math.abs(large.rows.lists.days*6-38.4)<1e-10);
});
test('hour rounding reconciles for many activities, fractional budgets and configurable day length', () => {
 for(const hours of [6,7.5,8]) for(const budget of [0,0.5,1,8.25,37.7]) {
  const sample = Array.from({length:106},(_,i)=>({key:String(i),days:i/100,unit:'',started:false,label:'Task'}));
  const result = estimate(sample,budget,{},hours);
  assert.ok(validateBudgetRows(result.rows,budget));
  const displayedCents = Object.values(result.rows).reduce((sum,row)=>sum+Math.round(row.days*hours*100),0);
  assert.equal(displayedCents,Math.round(budget*hours*100));
  assert.ok(Object.values(result.rows).every(row=>row.days>=0));
 }
});
test('missing standards, zero weights and malformed quantities never invent estimates', () => {
 assert.equal(estimate([{...items[0],days:null}],8).rows,null);
 assert.equal(estimate([{...items[0],days:null}],8).rawDays,null);
 assert.equal(estimate([{...items[0],days:0}],8).rows,null);
 assert.equal(estimate(items,null).rows.fixed.days,1);
 assert.equal(estimate(items,null).rows.lists.days,0.1);
 assert.equal(estimate([],8).rows,null);
 for(const quantity of [-1,1.5,Infinity,100001,NaN]) assert.equal(estimate(items,8,{lists:{days:0,started:false,quantity}}).rows,null);
 const zero = estimate(items,8,{lists:{days:0,started:false,quantity:0}});
 assert.equal(zero.rows.lists.days,0); assert.equal(zero.rows.fixed.days,8);
});
test('admin normalization preserves standards including intentional zero and portal variants share a standard', () => {
 const standards = {[key('task:day1','Setup')]:{days:0.25,unit:'prijslijst'},zero:{days:0,unit:''},bad:{days:-1,unit:'x'}};
 const config = normalizePricingConfig({implementationActivityBudgets:standards});
 assert.equal(config.implementationActivityBudgets.zero.days,0);
 assert.equal(config.implementationActivityBudgets.bad.days,null);
 assert.equal(config.implementationActivityBudgets[key('task:day1','Setup')].days,0.25);
 assert.deepEqual(normalizeActivityBudgets([]),{});
 assert.equal(key('customer-portal:basic','Setup'),key('customer-portal:premium','Setup'));
});
test('only selected work is estimated and customer confirmation alone reaches 100 percent', () => {
 const config=normalizePricingConfig({implementationTasks:[{key:'day1',name:'Dag 1',workItems:[{key:'a',label:'Setup',owner:'consultant'},{key:'b',label:'Import',owner:'together'}]}],implementationActivityBudgets:{[key('task:day1','Setup')]:{days:1,unit:''}}});
 const tasks=getConfiguredImplementationTasks(config);
 const selected=selectedEstimateItems(tasks,{[key('task:day1','Setup')]:true},config);
 assert.equal(selected.length,1); assert.equal(selected[0].started,true);
 const allocation=estimate(selected,8).rows;
 assert.equal(weightedProgress(8,allocation,{}),50);
 assert.equal(weightedProgress(8,allocation,{[selected[0].key]:{approvedAt:'date'}}),100);
});
test('budget state provides automatic rows everywhere, preserves manual snapshots and flags changed selection', async()=>{
 const taskKey=key('task:day1','Setup');
 let saved;
 let selected={[taskKey]:false};
 let config=normalizePricingConfig({implementationTasks:[{key:'day1',name:'Dag 1',workItems:[{key:'a',label:'Setup',owner:'consultant'}]}],implementationActivityBudgets:{[taskKey]:{days:2,unit:''}}});
 const server=loader({
  '@/lib/admin-api':{getServiceClient:()=>({})},
  '@/lib/price-settings-storage':{readStoredPricingConfig:async()=>({pricingConfig:config})},
  '@/lib/implementation-settings':{getImplementationHoursPerDay:async()=>6},
  '@/lib/local-db':{query:async sql=>({rows:sql.includes('join public.deals')?[{accepted_at:'date',calculator_inputs:{implementationDays:8},modules:[],implementation_item_progress:selected}]:saved?[{key:'implementation-budget:impl',payload:saved}]:[]})},
 })('@/lib/implementation-budget-server');
 let result=await server.getImplementationBudgetState('impl');
 assert.equal(result.automatic,true); assert.equal(result.allocationComplete,true); assert.equal(result.rows[taskKey].days,8);
 saved={version:'v1',rows:{[taskKey]:{days:8,started:true,quantity:3}}};
 config={...config,implementationActivityBudgets:{}};
 result=await server.getImplementationBudgetState('impl');
 assert.equal(result.automatic,false); assert.deepEqual(result.rows,saved.rows); assert.equal(result.version,'v1'); assert.equal(result.allocationComplete,true);
 selected={};result=await server.getImplementationBudgetState('impl');assert.equal(result.allocationComplete,false);
 saved=undefined;selected={[taskKey]:false};result=await server.getImplementationBudgetState('impl');assert.deepEqual(result.rows,{});assert.equal(result.allocationComplete,false);
});


test('extra activities and custom groups are text only and never block standard allocation', () => {
 const taskKey=key('task:day1','Setup');
 const extraKey=key('task:day1','Extra tekstregel');
 const config=normalizePricingConfig({implementationTasks:[{key:'day1',name:'Dag 1',workItems:[{key:'a',label:'Setup',owner:'consultant'}]}],implementationActivityBudgets:{[taskKey]:{days:1,unit:''}}});
 const tasks=getConfiguredImplementationTasks(config,{'task:day1':['Extra tekstregel'],'__implementation_tasks__':['Eigen groep']});
 const selected=selectedEstimateItems(tasks,{[taskKey]:false,[extraKey]:true},config);
 assert.equal(selected.length,1);assert.equal(selected[0].key,taskKey);
 const result=estimate(selected,14);
 assert.deepEqual(result.missing,[]);assert.equal(result.rows[taskKey].days,14);assert.equal(result.rows[extraKey],undefined);
});
test('one missing configured standard does not leave every known activity blank', () => {
 const result=estimate([...items,{key:'missing',label:'Nog geen norm',days:null,unit:'',started:false}],8);
 assert.ok(result.rows.fixed.days>0);assert.ok(result.rows.lists.days>0);
 assert.equal(result.rows.missing,undefined);assert.deepEqual(result.missing,['missing']);
 assert.ok(Math.abs(result.rows.fixed.days+result.rows.lists.days-8)<1e-10);
});
