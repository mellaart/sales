const {test}=require('node:test');const assert=require('node:assert/strict');const ts=require('typescript');const fs=require('node:fs');
const moduleUnderTest={exports:{}};
new Function('module','exports',ts.transpileModule(fs.readFileSync('lib/implementation-planning.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(moduleUnderTest,moduleUnderTest.exports);
const {approvedDays,validateBudgetRows,validHoursPerDay}=moduleUnderTest.exports;
test('approved days use stored evidence and never guess from current prices',()=>{
 assert.equal(approvedDays({calculator_inputs:{implementationDays:8}}),null);
 assert.equal(approvedDays({accepted_at:'date',calculator_inputs:{implementationDays:8}}),8);
 assert.equal(approvedDays({accepted_at:'date',calculator_inputs:{travelCostTotal:437.5,travelCostPerDay:62.5}}),7);
 assert.equal(approvedDays({accepted_at:'date',calculator_inputs:{}}),null);
 assert.equal(approvedDays({accepted_at:'date',calculator_inputs:{implementationDays:0}}),0);
});
test('budget totals and settings reject invalid numbers',()=>{
 assert.equal(validateBudgetRows({a:{days:2.5,started:false},b:{days:3.5,started:true}},6),true);
 for(const value of [{a:{days:5,started:false}},{a:{days:-1,started:true}},{a:{days:6,started:'approved'}},{a:{days:NaN,started:false}}])assert.equal(validateBudgetRows(value,6),false);
 for(const value of [0,-1,25,NaN,Infinity,'6',null])assert.equal(validHoursPerDay(value),false);
 assert.equal(validHoursPerDay(6),true);assert.equal(validHoursPerDay(7.5),true);
});
