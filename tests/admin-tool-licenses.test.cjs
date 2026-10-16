const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite');
function load(file,deps={}) { const m={exports:{}};new Function('module','exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,n=>{assert.ok(n in deps,n);return deps[n]});return m.exports; }
const relation=load('lib/deal-relation.ts');
const input=q=>({assetsExpansion:{relationId:22,lines:[{group:'Gebruikers',label:'Smart Trade Basic Extra gebruiker',quantity:q,cadence:'monthly'}]}});
function moduleFor(db,assets=async()=>[{name:'Smart Trade Basic licentie (gpex)'}]) {return load('lib/admin-tool-licenses.ts',{'@/lib/local-db':{query:(s,v)=>db.query(s,v),withTransaction:fn=>db.transaction(fn)},'@/lib/deal-relation':relation,'@/lib/smart-trade-api':{getAssetsWithModulesForRelation:assets}});}
test('only purchased ordinary licences count; support, drivers, planning and new customers do not',()=>{
 const m=moduleFor(null);assert.equal(m.purchasedRegularUsers(input(3)),3);
 const inputs=input(3);inputs.assetsExpansion.lines.push({group:'Gebruikers',label:'Smart Trade Basic Supportcontract Extra gebruiker',quantity:3,cadence:'monthly'},{group:'Chauffeursmodule',label:'Licentie extra gebruiker (chauffeursmodule)',quantity:5,cadence:'monthly'});
 assert.equal(m.purchasedRegularUsers(inputs),3);assert.equal(m.purchasedRegularUsers({extraUsers:20}),0);
 assert.throws(()=>m.purchasedRegularUsers(input(1.5)));assert.throws(()=>m.purchasedRegularUsers(input(-1)));
 const company={id:2,company:'gpex',system_max_users:'8'};
 assert.equal(m.matchCompany([{name:'Licence (chauffeursmodule) (gpex)'}],[company]).id,2);
 assert.equal(m.matchCompany([{name:'Licence (gpex) (3)'}],[company]).id,2);
 assert.throws(()=>m.matchCompany([{name:'Licence (gpex-other)'}],[company]));
});
test('durable queue, pagination, concurrent delivery, verification, ambiguous failures and safe retries',async()=>{
 const db=new PGlite(); const original=global.fetch; const oldToken=process.env.ADMIN_TOOL_API_TOKEN;
 process.env.ADMIN_TOOL_API_TOKEN='test-secret';
 try {
 await db.exec('create table app_settings(key text primary key,payload jsonb,updated_at timestamptz default now())');
 const m=moduleFor(db);let limit=8,puts=0,mode='ok';
 global.fetch=async(url,opts)=>{
   assert.equal(opts.headers.Authorization,'Bearer test-secret');assert.equal(opts.redirect,'error');
   if(opts.method==='PUT') {puts++;const target=JSON.parse(opts.body).system_max_users;assert.equal(typeof target,'string');limit=Number(target);if(mode==='timeout')throw Error('uncertain');if(mode==='403')return new Response('',{status:403});return new Response(null,{status:204});}
   if(mode==='unavailable')throw Error('offline');
   if(mode==='evil')return Response.json({data:[],links:{next:'https://evil.test/steal'}});
   if(!url.includes('?page=2'))return Response.json({data:[{id:1,company:'other',system_max_users:'4'}],links:{next:'https://admin.smarttrade.nu/api/companies?page=2'}});
   return Response.json({data:[{id:2,company:'gpex',system_max_users:String(limit)}],links:{next:null}});
 };
 const enqueue=id=>db.transaction(tx=>m.queueLicenseIncrease(tx,{id,calculator_inputs:input(2)}));
 await assert.rejects(()=>db.transaction(async tx=>{await m.queueLicenseIncrease(tx,{id:'rollback',calculator_inputs:input(2)});throw Error('rollback')}));
 assert.equal(await m.getLicenseSync('rollback'),null);
 await enqueue('a');await enqueue('a');assert.equal((await db.query('select * from app_settings')).rows.length,1);
 await Promise.all([m.syncLicenseIncreases('a'),m.syncLicenseIncreases('a')]);
 assert.equal(puts,1);assert.equal(limit,10);assert.equal((await m.getLicenseSync('a')).status,'synced');
 await m.syncLicenseIncreases('a');assert.equal(puts,1);
 await enqueue('b');mode='unavailable';await m.syncLicenseIncreases('b');assert.equal((await m.getLicenseSync('b')).status,'pending');assert.equal(puts,1);
 mode='ok';await m.syncLicenseIncreases('b');assert.equal(limit,12);assert.equal(puts,2);
 await enqueue('c');mode='evil';await m.syncLicenseIncreases('c');assert.equal(puts,2);assert.match((await m.getLicenseSync('c')).message,/Onveilige/);
 mode='timeout';await m.syncLicenseIncreases('c');assert.equal(limit,14);assert.equal(puts,3);assert.equal((await m.getLicenseSync('c')).status,'review');
 mode='ok';await m.syncLicenseIncreases('c');assert.equal(puts,3);
 await enqueue('d');await m.syncLicenseIncreases('d');assert.equal(puts,3);assert.equal((await m.getLicenseSync('d')).status,'pending');
 // A process interrupted after committing intent is never sent again.
 await db.query("update app_settings set payload=jsonb_set(payload,'{status}','\"applying\"') where key='admin-tool-license:c'");
 await m.syncLicenseIncreases('c');assert.equal(puts,3);
 }finally{global.fetch=original;if(oldToken===undefined)delete process.env.ADMIN_TOOL_API_TOKEN;else process.env.ADMIN_TOOL_API_TOKEN=oldToken;await db.close()}
});
