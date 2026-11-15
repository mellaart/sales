const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(file){const m={exports:{}};new Function('module','exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,()=>load('lib/inspection-administrations.ts'));return m.exports;}
const {getPackageAdministrationNames:names,getAdministrationAssets:select}=load('lib/asset-administrations.ts');
const asset=(name)=>({name});
const rows=[...['Alpha','Beta','Gamma','Delta','Epsilon'].map(name=>asset(`Smart Trade Starter licentie (${name})`)),asset('Smart Trade Enterprise support (alpha)'),asset('Hosting (Geen bedrijf)'),asset('Smart Trade connect (Andere naam)'),asset('Smart Trade StarterPlus (Geen pakket)'),asset('Smart Trade Starter (chauffeursmodule)'),asset('Smart Trade Starter (123)'),asset('CCV servicekosten (Beta)')];
test('only recognized Smart Trade packages identify five unique administrations',()=>assert.deepEqual(names(rows),['Alpha','Beta','Delta','Epsilon','Gamma']));
test('multiple administrations require a valid selection',()=>{assert.deepEqual(select(rows,''),[]);assert.deepEqual(select(rows,'Missing'),[]);});
test('selection includes matching assets across classes but excludes other and unassigned assets',()=>{assert.deepEqual(select(rows,'Beta').map(a=>a.name),['Smart Trade Starter licentie (Beta)','CCV servicekosten (Beta)']);assert.equal(select(rows,'Alpha').length,2);});
test('single administration immediately retains all customer assets',()=>{const rows=[asset('Smart Trade Basic (Alpha)'),asset('Hosting (Anders)'),asset('CCV servicekosten')];assert.equal(select(rows,''),rows);});
test('no recognizable administration retains the existing customer asset flow',()=>{const rows=[asset('CCV servicekosten')];assert.equal(select(rows,''),rows);});
