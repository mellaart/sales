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

test('weighted progress uses days, half for started and full only for customer approval',()=>{
 const {weightedProgress}=moduleUnderTest.exports;
 const rows={small:{days:2,started:true},large:{days:6,started:false}};
 assert.equal(weightedProgress(8,rows,{}),12.5);
 assert.equal(weightedProgress(8,rows,{large:{approvedAt:'date'}}),87.5);
 assert.equal(weightedProgress(8,rows,{large:{},small:{}}),100);
 assert.equal(weightedProgress(9,rows,{}),null);
 assert.equal(weightedProgress(null,rows,{}),null);
 assert.equal(weightedProgress(0,{},{}),null);
 assert.equal(weightedProgress(8,{small:{days:8,started:false}},{}),0);
});
