const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(path,deps={}) {
 const mod={exports:{}};
 new Function('module','exports','require',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(mod,mod.exports,name=>{if(!(name in deps))throw new Error(name);return deps[name]});
 return mod.exports;
}
const model=load('lib/implementations.ts');
const work=load('lib/work-activities.ts',{'@/lib/implementations':model});
test('custom work preserves owners through JSON save/reload while supporting old labels',()=>{
 const input={day:['Legacy task',{label:'  Customer   task ',owner:'customer'},{label:'Shared task',owner:'together'},{label:'Invalid owner',owner:'admin'}]};
 const normalized=model.normalizeImplementationCustomWorkItems(JSON.stringify(input));
 const restored=model.normalizeImplementationCustomWorkItems(JSON.stringify(normalized));
 assert.deepEqual(restored,normalized);
 const item=work.withImplementationCustomWorkItems({key:'day',label:'Day',selectableWorkItems:true},restored);
 const progress=Object.fromEntries(item.workItems.map(label=>[work.getImplementationWorkItemProgressKey('day',label),false]));
 const statuses=work.getImplementationWorkItemStatuses(item,progress);
 assert.deepEqual(statuses.map(row=>row.owner),['consultant','customer','together','consultant']);
 assert.ok(statuses.every(row=>row.selected&&!row.completed));
 assert.equal(statuses[1].label,'Customer task');
 assert.equal(statuses[0].key,work.getImplementationWorkItemProgressKey('day','Legacy task'));
});
test('custom ownership cannot overwrite configured work with the same label',()=>{
 const key=work.getImplementationWorkItemProgressKey('day','Existing');
 const item=work.withImplementationCustomWorkItems({key:'day',label:'Day',workItems:['Existing'],workItemOwners:{[key]:'together'}},{day:[{label:'existing',owner:'customer'},{label:'New',owner:'customer'}]});
 assert.deepEqual(item.workItems,['Existing','New']);
 assert.equal(item.workItemOwners[key],'together');
 assert.equal(item.workItemOwners[work.getImplementationWorkItemProgressKey('day','New')],'customer');
});
test('normalization rejects malformed items and deduplicates old and new formats',()=>{
 assert.deepEqual(model.normalizeImplementationCustomWorkItems({day:[null,4,{},'Test',{label:'test',owner:'customer'},{label:'   ',owner:'customer'}]}),{day:['Test']});
});
