const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const {PGlite}=require('@electric-sql/pglite');
function load(file,deps={}){const m={exports:{}};new Function('module','exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,n=>{assert.ok(n in deps,n);return deps[n];});return m.exports;}
test('expansion assets include only purchased lines, never base licences',()=>{
 const {buildDealAssetPlan}=load('lib/deal-assets.ts');
 const deal={package_key:'basic',package_name:'Basic',modules:[],calculator_inputs:{quoteLayout:'assets-expansion',assetsExpansion:{lines:[{group:'Klantenportaal',label:'Smart Trade - Facturen betalen',quantity:1,cadence:'monthly'}]}}};
 const plan=buildDealAssetPlan(deal);assert.equal(plan.items.length,1);assert.equal(plan.items[0].source,'Klantenportaal');assert.ok(plan.items[0].assetClassId>0);
 deal.calculator_inputs.assetsExpansion.lines=[{group:'Pakket',label:'Pakketadvies: Basic naar Premium',quantity:1,cadence:'monthly'}];assert.equal(buildDealAssetPlan(deal).items.length,0);assert.equal(buildDealAssetPlan(deal).warnings.length,1);
 deal.calculator_inputs.assetsExpansion.lines=[{group:'Gebruikers',label:'Smart Trade Basic Extra gebruiker',quantity:2,cadence:'monthly'}];assert.equal(buildDealAssetPlan(deal).items.length,2);
});
test('deal order requires acceptance, preview is read-only and ambiguous creation cannot repeat',async()=>{
 const db=new PGlite();try{
 await db.exec('create table app_settings(key text primary key,payload jsonb,updated_at timestamptz);create table implementations(id text,deal_id text,smart_trade_order_id text);create table profiles(id text,employee_relation_id int);insert into profiles values (\'actor\',21)');
 let accepted=null,calls=0,fail=false,amount=100;
 const api=load('app/api/deals/[dealId]/order/route.ts',{
 'next/server':{NextResponse:{json:(body,init)=>({body,...init})}},'@/lib/local-auth':{requireLocalUser:async()=>({ok:true,user:{id:'actor',email:'admin'},profile:{}})},'@/lib/local-db':{query:(s,v)=>db.query(s,v)},'@/lib/local-table':{executeLocalTableQuery:async()=>({data:{id:'deal',accepted_at:accepted,smart_trade_relation_id:123,implementation_total:amount,calculator_inputs:{},package_name:'Basic'}})},'@/lib/protected-admin':{isProtectedAdminEmail:()=>true},'@/lib/implementation-order':load('lib/implementation-order.ts'),'@/lib/smart-trade-pull-test':{getSmartTradePullConfig:()=>({baseUrl:'https://example.test'}),getSmartTradePullHeaders:()=>({}),fetchWithSmartTradeTimeout:async()=>{calls++;if(fail)throw new Error('timeout');return new Response(JSON.stringify({data:{id:444}}));}}});
 const context={params:Promise.resolve({dealId:'deal'})};const post=mode=>api.POST(new Request('https://example.test',{method:'POST',body:JSON.stringify({mode})}),context);
 assert.equal((await post('create')).status,409);accepted='date';amount=0;assert.equal((await post('create')).status,409);amount=100;
 assert.equal((await post('preview')).body.total,100);assert.equal(calls,0);
 const results=await Promise.all([post('create'),post('create')]);assert.equal(calls,1);assert.equal(results.filter(r=>r.status===201).length,1);
 assert.equal((await post('create')).status,409);
 await db.exec('delete from app_settings');fail=true;assert.equal((await post('create')).status,502);assert.equal((await post('create')).status,409);assert.equal(calls,2);
 }finally{await db.close();}
});
