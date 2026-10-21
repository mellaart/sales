const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');

async function overview({saved,implementation,license}={}) {
  const m={exports:{}};
  const deps={
    '@/lib/admin-tool-licenses':{getLicenseSync:async()=>license??null},
    '@/lib/implementation-assets-progress':{},
    '@/lib/deal-relation':{getDealRelationId:()=>1902},
    'next/server':{NextResponse:{json:(body,init)=>({body,...init})}},
    '@/lib/deal-assets':{buildDealAssetPlan:(_deal,name)=>({items:[{key:'user',name:`User (${name})`}],warnings:[]})},
    '@/lib/local-auth':{requireLocalUser:async()=>({ok:true,user:{id:'actor'},profile:{role:'admin'}})},
    '@/lib/local-db':{query:async(sql)=>{
      if(sql.includes('public.implementations'))return {rows:implementation?[implementation]:[]};
      if(sql.includes('public.app_settings'))return {rows:saved?[{payload:saved}]:[]};
      if(sql.includes('public.deal_asset_creations'))return {rows:[]};
      throw new Error(sql);
    }},
    '@/lib/local-table':{executeLocalTableQuery:async()=>({data:{id:'deal',accepted_at:'2026-10-21'}})},
    '@/lib/role-tab-access-storage':{readLocalRoleTabAccess:async()=>({})},
    '@/lib/role-tabs':{getTabPermission:()=> 'write'},
    '@/lib/smart-trade-pull-test':{},
  };
  new Function('module','exports','require',ts.transpileModule(fs.readFileSync('app/api/deals/[dealId]/assets/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,n=>{assert.ok(n in deps,n);return deps[n];});
  const result=await m.exports.GET(new Request('https://example.test'),{params:Promise.resolve({dealId:'deal'})});
  assert.equal(result.status,200);
  return result.body.overview;
}

test('existing user expansion uses the administration from its license sync',async()=>{
  const result=await overview({license:{status:'synced',administration:'pieper_ermelo'}});
  assert.equal(result.administrationName,'pieper_ermelo');
  assert.equal(result.items[0].name,'User (pieper_ermelo)');
  assert.ok(!result.prerequisiteErrors.includes('Vul eerst de administratienaam in.'));
  assert.equal(result.plannedGoLiveDate,null);
});
test('saved settings and implementation administration take precedence',async()=>{
  const license={administration:'old'};
  assert.equal((await overview({saved:{administrationName:'chosen'},license})).administrationName,'chosen');
  assert.equal((await overview({implementation:{id:'impl',administration_name:'implementation'},license})).administrationName,'implementation');
});
test('missing administration still requires input',async()=>{
  const result=await overview();
  assert.equal(result.administrationName,null);
  assert.ok(result.prerequisiteErrors.includes('Vul eerst de administratienaam in.'));
});
