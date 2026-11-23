const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const mod={exports:{}};
new Function('module','exports',ts.transpileModule(fs.readFileSync('lib/save-queue.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod,mod.exports);
const {createSaveQueue}=mod.exports;
test('rapid name edits wait for creation and update the same deal in order',async()=>{
  const queue=createSaveQueue();
  let release;
  const blocked=new Promise(resolve=>release=resolve);
  let id=null;
  const writes=[];
  const first=queue(async()=>{await blocked;id='deal-1';writes.push(['create',id,'First']);return id;});
  const second=queue(async()=>{writes.push(['update',id,'Second']);return id;});
  const third=queue(async()=>{writes.push(['update',id,'Latest']);return id;});
  await Promise.resolve();
  assert.deepEqual(writes,[]);
  release();
  assert.deepEqual(await Promise.all([first,second,third]),['deal-1','deal-1','deal-1']);
  assert.deepEqual(writes,[['create','deal-1','First'],['update','deal-1','Second'],['update','deal-1','Latest']]);
});
test('a failed save does not block a subsequent retry',async()=>{
  const queue=createSaveQueue();
  const failed=queue(async()=>{throw new Error('offline');});
  const retry=queue(async()=>true);
  await assert.rejects(failed,/offline/);
  assert.equal(await retry,true);
});
