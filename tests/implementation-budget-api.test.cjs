const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const {PGlite}=require('@electric-sql/pglite');
function load(file,deps={}){const m={exports:{}};new Function('module','exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,n=>{assert.ok(n in deps,n);return deps[n];});return m.exports;}
test('budget API requires access, preserves exact totals and protects concurrent edits',async()=>{
 const db=new PGlite();try{
 await db.exec("create table app_settings(key text primary key,payload jsonb,updated_at timestamptz); create table deals(id text,accepted_at text,calculator_inputs jsonb); insert into deals values ('deal','today','{\"implementationDays\":6}');");
 let logged=true,write=true,visible=true;
 const api=load('app/api/implementations/[implementationId]/budget/route.ts',{
 'next/server':{NextResponse:{json:(body,init)=>({body,...init})}},
 '@/lib/local-auth':{requireLocalUser:async()=>({ok:logged,user:{id:'consultant',email:'test@test.nl'},profile:{role:'consultant'}})},
 '@/lib/local-db':{query:(sql,params)=>db.query(sql,params)},
 '@/lib/local-table':{executeLocalTableQuery:async()=>({data:visible?{id:'impl',deal_id:'deal',implementation_customer_work_approvals:{approved:{approvedAt:'date'}}}:null})},
 '@/lib/role-tab-access-storage':{readLocalRoleTabAccess:async()=>({})},
 '@/lib/role-tabs':{canWriteTab:()=>write},
 '@/lib/protected-admin':{isProtectedAdminEmail:()=>false},
 '@/lib/implementation-budget-server':{getImplementationBudgetState:async()=>{
  const result=await db.query("select payload from app_settings where key='implementation-budget:impl'");
  return {budget:6,rows:result.rows[0]?.payload.rows??{},version:result.rows[0]?.payload.version??null,hoursPerDay:7.5,items:[{key:'one'},{key:'two'}]};
 }},
 '@/lib/implementation-planning':load('lib/implementation-planning.ts')});
 const context={params:Promise.resolve({implementationId:'impl'})};
 const get=()=>api.GET(new Request('https://test.test'),context);
 const put=(rows,version=null)=>api.PUT(new Request('https://test.test',{method:'PUT',body:JSON.stringify({rows,budget:6,version})}),context);
 const rows={one:{days:2,started:false},two:{days:4,started:true}};
 logged=false;assert.equal((await get()).status,401);logged=true;
 visible=false;assert.equal((await put(rows)).status,404);visible=true;
 write=false;assert.equal((await put(rows)).status,403);write=true;
 assert.equal((await get()).body.hoursPerDay,7.5);
 assert.equal((await put({one:{days:5,started:false}})).status,400);
 assert.equal((await put({one:{days:2,started:false,quantity:-1},two:{days:4,started:true}})).status,400);
 assert.equal((await put({one:{days:2,started:false},two:{days:4.001,started:true}})).status,400);
 assert.equal((await put({unknown:{days:6,started:false}})).status,409);
 const saved=await put(rows);assert.equal(saved.status,200);
 assert.equal((await put(rows)).status,409);
 assert.deepEqual((await get()).body.rows,rows);
 const updated=await put(rows,saved.body.version);assert.equal(updated.status,200);
 assert.equal((await put(rows,saved.body.version)).status,409);
 await db.exec('update deals set accepted_at=null');assert.equal((await put(rows,updated.body.version)).status,400);
 }finally{await db.close();}
});
