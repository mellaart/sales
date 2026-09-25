import {getImplementationBudgetState} from "@/lib/implementation-budget-server";
import {validateBudgetRows,budgetWithRemainder} from "@/lib/implementation-planning";
import {getImplementationTicketHours} from "@/lib/implementation-ticket-hours";
import {calculateImplementationForecast} from "@/lib/implementation-forecast";
// Call only after checking access to the implementation or its customer link.
export async function getImplementationForecast(implementationId:string){
 const {budget,rows:allocation,approvals,ticketId,allocationComplete,hoursPerDay}=await getImplementationBudgetState(implementationId);
 const balance = budgetWithRemainder(budget, allocation, hoursPerDay);
 let progress:number|null=null;
 if(allocationComplete&&budget!==null&&budget>0&&validateBudgetRows(allocation,null)&&balance&&!balance.overBudget)progress=Math.min(100,Object.entries(allocation).reduce((total,[key,row])=>total+row.days*(approvals[key]?1:row.started?0.5:0),0)/budget*100);
 let usedDays:number|null=null;
 if(ticketId){try{usedDays=(await getImplementationTicketHours(ticketId)).workedDays;}catch{/* Unavailable hours must never look like zero usage. */}}
 return calculateImplementationForecast(budget,progress,usedDays);
}
