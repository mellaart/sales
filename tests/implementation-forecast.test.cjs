const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
const fs=require('node:fs');
function load(path,deps={}) {
 const mod={exports:{}};
 new Function('module','exports','require',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(mod,mod.exports,name=>{if(!(name in deps))throw new Error(name);return deps[name]});
 return mod.exports;
}
const calc=load('lib/implementation-forecast.ts');
const {calculateImplementationForecast:f}=calc;
test('forecast projects total days and overrun from actual consumption and weighted progress',()=>{
 const result=f(8,50,5.6);
 assert.equal(result.expectedDays,11.2);
 assert.ok(Math.abs(result.differenceDays-3.2)<1e-10);
 assert.equal(result.signal,'notify');
 assert.equal(f(8,100,6).expectedDays,6);
 assert.equal(f(8,100,6).signal,'on_track');
});
test('30 percent gate and signal thresholds use unrounded values',()=>{
 assert.equal(f(10,20,2.999).signal,'early');
 assert.equal(f(10,20,2.999).expectedDays,null);
 assert.equal(f(10,28.5,3).signal,'on_track');
 assert.equal(f(10,28.49,3).signal,'discuss');
 assert.equal(f(10,24,3).signal,'discuss');
 assert.equal(f(10,23.99,3).signal,'notify');
});
test('missing inputs and zero progress never invent a forecast',()=>{
 for(const args of [[null,50,5],[0,50,5],[8,null,5],[8,50,null],[8,50,-1],[8,Infinity,5]]){
  assert.equal(f(...args).signal,'unavailable');assert.equal(f(...args).expectedDays,null);
 }
 assert.equal(f(8,0,0).signal,'early');
 assert.equal(f(8,0,4).signal,'notify');
 assert.equal(f(8,0,4).expectedDays,null);
});
test('server uses approved budget, day weights, customer approval and booked ticket days',async()=>{
 let approvals={large:{approvedAt:'date'}};
 let failHours=false;let budget=8;let seenTicket;
 const server=load('lib/implementation-forecast-server.ts',{
  '@/lib/local-db':{query:async sql=>({rows:sql.includes('join public.deals')?[{accepted_at:'date',calculator_inputs:{implementationDays:budget},approvals}]:[{key:'implementation-budget:abc',payload:{rows:{small:{days:2,started:true},large:{days:6,started:false}}}},{key:'implementation-ticket:abc',payload:{ticketId:'123'}}]})},
  '@/lib/implementation-planning':load('lib/implementation-planning.ts'),
  '@/lib/implementation-ticket-hours':{getImplementationTicketHours:async id=>{seenTicket=id;if(failHours)throw new Error('down');return {workedDays:4}}},
  '@/lib/implementation-forecast':calc,
 });
 let result=await server.getImplementationForecast('abc');
 assert.equal(seenTicket,'123');assert.equal(result.progressPercent,87.5);assert.equal(result.usedPercent,50);
 approvals={};result=await server.getImplementationForecast('abc');assert.equal(result.progressPercent,12.5);
 failHours=true;result=await server.getImplementationForecast('abc');assert.equal(result.usedDays,null);assert.equal(result.expectedDays,null);
 failHours=false;budget=10;result=await server.getImplementationForecast('abc');assert.equal(result.progressPercent,null);assert.equal(result.signal,'unavailable');
});
test('forecast API rejects unauthenticated and inaccessible implementations before fetching hours',async()=>{
 let loggedIn=false;let accessible=false;let calls=0;
 const route=load('app/api/implementations/[implementationId]/forecast/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
  '@/lib/local-auth':{requireLocalUser:async()=>({ok:loggedIn,user:{id:'user'},profile:{}})},
  '@/lib/local-table':{executeLocalTableQuery:async()=>({data:accessible?{id:'abc'}:null})},
  '@/lib/implementation-forecast-server':{getImplementationForecast:async()=>{calls++;return f(8,50,4)}},
 });
 const run=()=>route.GET({}, {params:Promise.resolve({implementationId:'abc'})});
 assert.equal((await run()).status,401);loggedIn=true;
 assert.equal((await run()).status,404);assert.equal(calls,0);accessible=true;
 const response=await run();assert.equal(response.status,200);assert.equal(response.headers['Cache-Control'],'no-store');assert.equal(calls,1);
});
