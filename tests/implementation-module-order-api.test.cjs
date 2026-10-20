const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite');
function load(file,deps={}){const m={exports:{}};new Function('module','exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,n=>{assert.ok(n in deps,n);return deps[n];});return m.exports;}
for(const endpoint of ['deals','implementations'])for(const failSecond of [false,true]){
 test(`${endpoint}: module orders, travel eligibility, persisted status and duplicate protection (${failSecond?'partial failure':'success'})`,async()=>{
  const db=new PGlite();
  try{
   await db.exec(`create table app_settings(key text primary key,payload jsonb,updated_at timestamptz);
    create table implementations(id text,deal_id text,customer_name text,smart_trade_order_id text,smart_trade_order_created_at timestamptz,smart_trade_order_pending_at timestamptz,progress jsonb,updated_at timestamptz);
    create table profiles(id text,email text,employee_relation_id int);
    insert into profiles values ('actor','admin',21);
    create table deals(id text,smart_trade_relation_id int,package_name text,modules jsonb,implementation_total numeric,calculator_inputs jsonb);`);
   const deal={id:'deal',accepted_at:'2026-10-20',smart_trade_relation_id:123,package_name:'Uitbreiding',modules:[],implementation_total:1170,
    calculator_inputs:{travelCostTotal:50,travelCostPerDay:50,travelRegion:1,assetsExpansion:{lines:[
     {group:'Implementatie',label:'Implementatie Suite MKB koppeling',quantity:1,cadence:'once',amount:400,requiresTravel:false},
     {group:'Implementatie',label:'Implementatie Kassa',quantity:1,cadence:'once',amount:720,requiresTravel:true},
    ]}}};
   await db.query('insert into deals values ($1,$2,$3,$4,$5,$6)',[deal.id,123,deal.package_name,JSON.stringify(deal.modules),1170,JSON.stringify(deal.calculator_inputs)]);
   if(endpoint==='implementations')await db.exec("insert into implementations(id,deal_id) values ('impl','deal')");
   const sent=[];
   const trade={getSmartTradePullConfig:()=>({baseUrl:'https://example.test'}),getSmartTradePullHeaders:()=>({}),fetchWithSmartTradeTimeout:async(url,headers,mode,init)=>{
    sent.push(JSON.parse(init.body));if(failSecond&&sent.length===2)throw new Error('timeout');return new Response(JSON.stringify({data:{id:500+sent.length}}));
   }};
   const deps={
    'next/server':{NextResponse:{json:(body,init)=>({body,...init})}},
    '@/lib/local-auth':{requireLocalUser:async()=>({ok:true,user:{id:'actor',email:'admin'},profile:{}})},
    '@/lib/local-db':{query:(sql,args)=>db.query(sql,args)},
    '@/lib/local-table':{executeLocalTableQuery:async({table})=>({data:table==='deals'?deal:(await db.query('select * from implementations')).rows[0]})},
    '@/lib/protected-admin':{isProtectedAdminEmail:()=>true,PROTECTED_ADMIN_EMAILS:['admin']},
    '@/lib/implementation-order':load('lib/implementation-order.ts'),
    '@/lib/admin-api':{getServiceClient:()=>null},
    '@/lib/price-settings-storage':{readStoredPricingConfig:async()=>({pricingConfig:{modules:[],packages:[]}})},
    '@/lib/deal-relation':load('lib/deal-relation.ts'),
   };
   deps['@/lib/implementation-order-batch']=load('lib/implementation-order-batch.ts',{'@/lib/local-db':deps['@/lib/local-db'],'@/lib/smart-trade-pull-test':trade});
   const api=load(`app/api/${endpoint}/[${endpoint==='deals'?'dealId':'implementationId'}]/order/route.ts`,deps);
   const context={params:Promise.resolve({dealId:'deal',implementationId:'impl'})};
   const post=mode=>api.POST(new Request('https://example.test',{method:'POST',body:JSON.stringify({mode})}),context);
   const preview=await post('preview');assert.equal(preview.status,200);assert.equal(preview.body.orders.length,2);assert.equal(sent.length,0);
   assert.equal((await db.query('select * from app_settings')).rows.length,0);
   const response=await post('create');assert.equal(response.status,failSecond?(endpoint==='deals'?502:500):201);
   assert.deepEqual(sent.map(p=>p.reference),['Implementatie Suite MKB','Implementatie Kassa']);
   assert.equal(sent[0].lines.length,1);assert.equal(sent[0].lines[0].price,'400');
   assert.equal(sent[1].lines.length,2);assert.equal(sent[1].lines[1].price,'50');
   assert.equal((await post('create')).status,409);assert.equal(sent.length,2);
   const saved=(await db.query('select payload from app_settings')).rows[0].payload;
   assert.equal(saved.status,failSecond?'pending':'created');assert.equal(saved.orders.length,failSecond?1:2);
   if(endpoint==='implementations'){
    const implementation=(await db.query('select * from implementations')).rows[0];
    assert.equal(implementation.smart_trade_order_id,failSecond?null:'501, 502');
    assert.equal(Boolean(implementation.progress?.implementationOrder),!failSecond);
    assert.equal(Boolean(implementation.smart_trade_order_pending_at),failSecond);
   }else{
    const status=await api.GET(new Request('https://example.test'),context);
    assert.equal(status.body.pending,failSecond);assert.equal(status.body.orders.length,failSecond?1:2);
   }
  }finally{await db.close();}
 });
}
