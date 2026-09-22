const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
const fs=require('node:fs');
const source=fs.readFileSync('components/implementation-editor.tsx','utf8');
const ast=ts.createSourceFile('editor.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=new Set(['toggleAppointmentWorkItem','changeOption','changeGroup']);
const functions=[];
function visit(node){if(ts.isFunctionDeclaration(node)&&names.has(node.name?.text))functions.push(node.getText(ast));ts.forEachChild(node,visit);}
visit(ast);
const body=ts.transpileModule(functions.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
function picker(selected,options){
 let result=selected;
 const group={key:'day',items:options};
 const controls=new Function('selected','groups','selectedKeys','otherAssignment','onSelectionChange',body+';return {changeOption,changeGroup};')(selected,[group],new Set(selected.map(x=>x.key)),()=>({id:'previous'}),value=>result=value);
 return {...controls,result:()=>result};
}
const task={key:'work:1',group:'Dag 1',label:'Open werkzaamheid'};
test('previously scheduled work can be selected again without duplication or changing earlier appointment',()=>{
 const previous=Object.freeze([Object.freeze({...task})]);
 let ui=picker([],previous);ui.changeOption(task,true);assert.deepEqual(ui.result(),[task]);
 ui=picker(ui.result(),previous);ui.changeOption(task,true);assert.equal(ui.result().length,1);
 ui.changeOption(task,false);assert.deepEqual(ui.result(),[]);assert.deepEqual(previous,[task]);
});
test('whole group includes work already planned elsewhere and can be deselected',()=>{
 const options=[task,{key:'work:2',group:'Dag 1',label:'Andere werkzaamheid'}];
 let ui=picker([],options);ui.changeGroup('day');assert.deepEqual(ui.result(),options);
 ui=picker(ui.result(),options);ui.changeGroup('day');assert.deepEqual(ui.result(),[]);
});
