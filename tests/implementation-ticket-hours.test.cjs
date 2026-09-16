const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
test('ticket hours use the aggregate include, preserve zero and reject missing or invalid hours',async()=>{
 let hoursPerDay=6, raw='12.50', ok=true, calls=[];
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync('lib/implementation-ticket-hours.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('module','exports','require',code)(module,module.exports,name=>name==='@/lib/implementation-settings'?{getImplementationHoursPerDay:async()=>hoursPerDay}:({getSmartTradePullHeaders:()=>({}),fetchWithSmartTradeTimeout:async(...args)=>{calls.push(args);return {ok,json:async()=>({data:{workedHours:raw}})};}}));
 const read=()=>module.exports.getImplementationTicketHours('15429');
 assert.deepEqual(await read(),{workedHours:12.5,workedDays:12.5/6,hoursPerDay:6});
 assert.equal(calls[0][0],'https://my.troublefree.nl/v3/api/ticketing/tickets/15429?include=workedHours');
 assert.equal(calls[0][3].method,'GET');
 hoursPerDay=5; assert.equal((await read()).workedDays,2.5);
 raw='0.00';assert.equal((await read()).workedHours,0);
 for(const invalid of [null,undefined,'',true,'abc',-1,'-1',Infinity]){raw=invalid;await assert.rejects(read);}
 raw='12.50';ok=false;await assert.rejects(read);
 await assert.rejects(()=>module.exports.getImplementationTicketHours('../other'));
});
