import {query} from "@/lib/local-db";
import {approvedDays,validateBudgetRows,type BudgetRow} from "@/lib/implementation-planning";
import {getImplementationTicketHours} from "@/lib/implementation-ticket-hours";
import {calculateImplementationForecast} from "@/lib/implementation-forecast";
// Call only after checking access to the implementation or its customer link.
export async function getImplementationForecast(implementationId:string){
 const {rows}=await query<{accepted_at:string|null;calculator_inputs:Record<string,unknown>;approvals:Record<string,unknown>}>(`select d.accepted_at,d.calculator_inputs,i.implementation_customer_work_approvals as approvals from public.implementations i join public.deals d on d.id=i.deal_id where i.id=$1`,[implementationId]);
 const record=rows[0];const budget=approvedDays(record??{});
 const settings=await query<{key:string;payload:{rows?:Record<string,BudgetRow>;ticketId?:string}}>("select key,payload from public.app_settings where key=any($1::text[])",[[`implementation-budget:${implementationId}`,`implementation-ticket:${implementationId}`]]);
 const allocation=settings.rows.find(row=>row.key===`implementation-budget:${implementationId}`)?.payload.rows;
 const ticketId=settings.rows.find(row=>row.key===`implementation-ticket:${implementationId}`)?.payload.ticketId;
 let progress:number|null=null;
 if(budget!==null&&budget>0&&validateBudgetRows(allocation,budget))progress=Math.min(100,Object.entries(allocation).reduce((total,[key,row])=>total+row.days*(record?.approvals?.[key]?1:row.started?0.5:0),0)/budget*100);
 let usedDays:number|null=null;
 if(ticketId){try{usedDays=(await getImplementationTicketHours(ticketId)).workedDays;}catch{/* Unavailable hours must never look like zero usage. */}}
 return calculateImplementationForecast(budget,progress,usedDays);
}
