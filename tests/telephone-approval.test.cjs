const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const {PGlite}=require('@electric-sql/pglite');
function compile(code,deps){const mod={exports:{}};new Function('module','exports','require',ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod,mod.exports,name=>deps[name]);return mod.exports;}
test('telephone approval requires personal admin access and explicit confirmation',async()=>{
 let actor={ok:false};let calls=0;
 const {POST}=compile(fs.readFileSync('app/api/deals/[dealId]/telephone-approval/route.ts','utf8'),{'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},'@/lib/local-auth':{requireLocalUser:async()=>actor},'@/lib/protected-admin':{isProtectedAdminEmail:email=>email==='owner@test.nl'},'@/lib/deal-approval-server':{recordTelephoneDealApproval:async()=>{calls++;return {accepted_at:'now'}}}});
 const run=body=>POST(new Request('https://example.test',{method:'POST',body:JSON.stringify(body)}),{params:Promise.resolve({dealId:'deal'})});
 assert.equal((await run({confirmed:true})).status,401);actor={ok:true,user:{email:'other@test.nl'}};
 assert.equal((await run({confirmed:true})).status,403);actor.user.email='owner@test.nl';
 assert.equal((await run({confirmed:false})).status,400);assert.equal(calls,0);
 assert.equal((await run({confirmed:true})).status,200);assert.equal(calls,1);
});
test('telephone approval records matching deal and approval, preserves recorder audit and is idempotent',async()=>{
 const db=new PGlite();try{
 await db.exec(`create table deals(id text primary key, user_id text, contact_name text,contact_email text,accepted_at timestamptz,accepted_by_name text,accepted_by_email text);
 create table deal_approvals(id text primary key,deal_id text unique,created_by text,status text,recipient_email text,contact_name text,quote_snapshot jsonb,snapshot_hash text,accepted_at timestamptz,accepted_by_name text,accepted_by_email text,accepted_ip text,accepted_user_agent text,updated_at timestamptz,token_version integer default 1);
 create table app_settings(key text primary key,payload jsonb);
 insert into deals(id,user_id,contact_name) values('deal','user','Contact');`);
 const source=fs.readFileSync('lib/deal-approval-server.ts','utf8');const fragment=source.slice(source.indexOf('export async function recordTelephoneDealApproval'));
 const code=ts.transpileModule(fragment,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 new Function('exports','withTransaction','canManageDeal','createId','quoteSnapshotFromDeal','snapshotHashFromDeal',code)(mod.exports,fn=>db.transaction(fn),()=>true,()=> 'approval',()=>({total:100}),()=> 'snapshot');
 const actor={user:{id:'user',email:'owner@test.nl'},profile:{full_name:'Owner'}};
 const first=await mod.exports.recordTelephoneDealApproval('deal',actor);
 assert.ok(first.accepted_at);assert.match(first.accepted_by_name,/Telefonisch akkoord/);
 const approval=(await db.query('select * from deal_approvals')).rows[0];assert.equal(approval.status,'accepted');assert.equal(approval.snapshot_hash,'snapshot');
 const second=await mod.exports.recordTelephoneDealApproval('deal',{...actor,profile:{full_name:'Different'}});
 assert.equal(second.accepted_by_name,first.accepted_by_name);
 const audit=(await db.query('select * from app_settings')).rows;assert.equal(audit.length,1);assert.equal(audit[0].payload.method,'telephone');assert.equal(audit[0].payload.recordedBy,'user');
 await db.exec("update deals set accepted_at=null where id='deal'; update deal_approvals set status='open',snapshot_hash='old' where deal_id='deal'");
 await mod.exports.recordTelephoneDealApproval('deal',actor);
 const existing=(await db.query('select * from deal_approvals')).rows;assert.equal(existing.length,1);assert.equal(existing[0].status,'accepted');assert.equal(existing[0].snapshot_hash,'snapshot');
 }finally{await db.close();}
});
