const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const mod={exports:{}};
let selected=[], calls=0;
const deps={
 '@/lib/deal-assets':{buildDealAssetPlan:deal=>({items:deal.items})},
 '@/lib/local-db':{query:async()=>{calls++;return {rows:selected};}},
};
new Function('module','exports','require',ts.transpileModule(fs.readFileSync('lib/implementation-assets-progress.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod,mod.exports,name=>deps[name]);
const {allDealAssetsCreated,withImplementationAssetProgress}=mod.exports;
test('assets only complete after every planned asset has a confirmed ID',()=>{
 const deal={items:[{key:'license'},{key:'users'}]};
 const created=key=>({plan_key:key,status:'created',smart_trade_asset_id:123});
 assert.equal(allDealAssetsCreated({items:[]},[]),false);
 assert.equal(allDealAssetsCreated(deal,[created('license')]),false);
 assert.equal(allDealAssetsCreated(deal,[created('license'),{...created('users'),status:'pending'}]),false);
 assert.equal(allDealAssetsCreated(deal,[created('license'),{...created('users'),smart_trade_asset_id:null}]),false);
 assert.equal(allDealAssetsCreated(deal,[created('license'),created('users')]),true);
});
test('historical completions merge into progress without changing other checks',async()=>{
 selected=[{implementation_id:'one',items:[{key:'license'}],creations:[{plan_key:'license',status:'created',smart_trade_asset_id:123}]}];
 const rows=[{id:'one',progress:{assets:false,dnsInstructions:true}},{id:'two',progress:{assets:false}}];
 const result=await withImplementationAssetProgress(rows);
 assert.deepEqual(result[0].progress,{assets:true,dnsInstructions:true});
 assert.deepEqual(result[1],rows[1]);
 assert.equal(rows[0].progress.assets,false);
 const before=calls;
 await withImplementationAssetProgress([{id:'one'}]);
 assert.equal(calls,before,'projections without progress do not need asset queries');
});
