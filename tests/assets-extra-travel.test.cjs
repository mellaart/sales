const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('components/assets-dashboard-current.tsx','utf8');
const calculation=source.slice(source.indexOf('  const totalTravelVisits ='),source.indexOf('  const currentCompleteMonthly ='));
const calculate=new Function('travelImplementationDays','extraTravelVisits','includeTravelCosts','pinQuote','price',`
const pricingConfig={}, travelPostcodePrefix="1234";
const useMemo=fn=>fn();
const getTravelCostQuoteForPostcode=()=>price===null?null:{pricePerDay:price};
${calculation}
return {travelCostTotal,totalTravelVisits};
`);
test('extra visits add regional travel charges without scaling standard travel',()=>{
 assert.equal(calculate(1.5,0,true,false,100).travelCostTotal,150);
 assert.equal(calculate(1.5,2,true,false,100).travelCostTotal,350);
 assert.equal(calculate(0,2,true,false,75).travelCostTotal,150);
 assert.equal(calculate(1.5,2,false,false,100).travelCostTotal,0);
 assert.equal(calculate(1.5,2,true,true,100).travelCostTotal,0);
 assert.equal(calculate(1.5,2,true,false,null).travelCostTotal,0);
});
