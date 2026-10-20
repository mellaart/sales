const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
function load(deps) {
 const mod = { exports: {} };
 new Function('module','exports','require',ts.transpileModule(fs.readFileSync('lib/implementation-order-batch.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
 }).outputText)(mod,mod.exports,name=>deps[name]);
 return mod.exports.createImplementationOrderBatch;
}
const payloads = ['Suite MKB', 'Mailchimp'].map(name => ({reference:`Implementatie ${name}`,lines:[]}));
for (const failure of [null, 'timeout', 'missing-id', 'http-error']) {
 test(`separate orders persist their references and block duplicates (${failure || 'success'})`, async()=>{
  const db = new PGlite();
  try {
   await db.exec('create table app_settings(key text primary key,payload jsonb,updated_at timestamptz)');
   const sent=[];
   const create=load({
    '@/lib/local-db':{query:(sql,args)=>db.query(sql,args)},
    '@/lib/smart-trade-pull-test':{
     getSmartTradePullConfig:()=>({baseUrl:'https://example.test'}),getSmartTradePullHeaders:()=>({}),
     fetchWithSmartTradeTimeout:async(url,headers,mode,init)=>{
      sent.push(JSON.parse(init.body));
      if(sent.length===2){
       if(failure==='timeout')throw new Error('timeout');
       if(failure==='missing-id')return new Response('{}');
       if(failure==='http-error')return new Response('{}',{status:500});
      }
      return new Response(JSON.stringify({data:{id:100+sent.length}}));
     },
    },
   });
   if(failure)await assert.rejects(create('batch',payloads,'actor'),/101.*Suite MKB.*opnieuw aanmaken is geblokkeerd/);
   else assert.deepEqual(await create('batch',payloads,'actor'),[
    {orderId:'101',reference:'Implementatie Suite MKB'}, {orderId:'102',reference:'Implementatie Mailchimp'},
   ]);
   assert.deepEqual(sent.map(p=>p.reference),payloads.map(p=>p.reference));
   const saved=(await db.query('select payload from app_settings')).rows[0].payload;
   assert.equal(saved.status,failure?'pending':'created');
   assert.equal(saved.orders.length,failure?1:2);
   await assert.rejects(create('batch',payloads,'actor'),/eerdere poging/);
   assert.equal(sent.length,2);
  } finally {await db.close();}
 });
}
