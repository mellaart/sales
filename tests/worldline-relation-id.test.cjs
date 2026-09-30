const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
test('explicit relation ID bypasses software search and its cache, validating IDs before lookup',async()=>{
 let direct=0,search=0;
 const deps={'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
 '@/lib/smart-trade-api':{getRelationName:r=>r.company,
 getRelationById:async id=>{direct++;if(id==='999')throw new Error('Relatie niet gevonden');return {id:Number(id),company:'Pin-only klant'};},
 searchRelations:async()=>{search++;return [];}}};
 const m={exports:{}};
 new Function('module','exports','require',ts.transpileModule(fs.readFileSync('app/api/smart-trade/relations/search/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,n=>deps[n]);
 const run=q=>m.exports.GET(new Request('https://test.test/?'+q));
 assert.deepEqual((await run('query=2025')).body.relations,[]);
 for(let i=0;i<2;i++)assert.equal((await run('relationId=2025')).body.relations[0].id,'2025');
 assert.equal(direct,2);assert.equal(search,1);
 for(const id of ['', '0','-1','2025abc','9007199254740992'])assert.equal((await run('relationId='+id)).status,400);
 assert.equal(direct,2);
 const fail=await run('relationId=999');assert.equal(fail.status,500);assert.equal(fail.body.relations,undefined);
});
