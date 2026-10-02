const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const crypto=require('node:crypto');
function load(file,deps={}) {
 const m={exports:{}};
 new Function('module','exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,n=>{if(n in deps)return deps[n];throw Error(n);});
 return m.exports;
}
test('stored encrypted PINs are decrypted before input normalization and still hidden from read-only users',async()=>{
 const saved=process.env.SALES_CUSTOMER_FORM_SIGNING_KEY;
 process.env.SALES_CUSTOMER_FORM_SIGNING_KEY='return-pin-regression-test-only';
 try {
  const key=crypto.createHash('sha256').update('worldline-return-pin:return-pin-regression-test-only').digest();
  function encrypt(pin){
   const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
   const text=Buffer.concat([cipher.update(pin,'utf8'),cipher.final()]);
   return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),text.toString('base64url')].join(':');
  }
  const form={id:'form',project_id:'project',version:1,status:'accepted',token_version:1,
   form_data:{authorizedUsers:[{id:'one',name:'Test One',pinCode:encrypt('0123')},{id:'two',name:'Test Two',pinCode:encrypt('9876')}]},
   expires_at:'2027-01-01',created_at:'2026-01-01',updated_at:'2026-01-01'};
  assert.ok(form.form_data.authorizedUsers[0].pinCode.length>24);
  const original=JSON.stringify(form);
  const api=load('lib/worldline-return-pin-server.ts',{
   'node:crypto':crypto,
   '@/lib/local-db':{query:async(sql)=>({rows:sql.includes('from public.worldline_projects')?[{id:'project',relation_name:'Test'}]:[form]})},
   '@/lib/worldline':{},
   '@/lib/worldline-return-pin':load('lib/worldline-return-pin.ts'),
  });
  const req=new Request('https://example.test');
  const revealed=await api.getWorldlineReturnPinForms(req,'project',true);
  assert.deepEqual(revealed.forms[0].formData.authorizedUsers.map(u=>u.pinCode),['0123','9876']);
  const hidden=await api.getWorldlineReturnPinForms(req,'project',false);
  assert.deepEqual(hidden.forms[0].formData.authorizedUsers.map(u=>u.pinCode),['','']);
  assert.equal(JSON.stringify(form),original,'reading never modifies stored evidence');
 }finally{
  if(saved===undefined)delete process.env.SALES_CUSTOMER_FORM_SIGNING_KEY;
  else process.env.SALES_CUSTOMER_FORM_SIGNING_KEY=saved;
 }
});
