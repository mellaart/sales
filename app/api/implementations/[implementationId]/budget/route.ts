import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import { query } from "@/lib/local-db";
import { executeLocalTableQuery } from "@/lib/local-table";
import { readLocalRoleTabAccess } from "@/lib/role-tab-access-storage";
import { canWriteTab } from "@/lib/role-tabs";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { approvedDays, validateBudgetRows } from "@/lib/implementation-planning";
import { getImplementationBudgetState } from "@/lib/implementation-budget-server";
export const dynamic = "force-dynamic";
const json = (body: unknown, status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
type Context = {params: Promise<{implementationId:string}>};
async function access(request:Request, context:Context, write=false) {
  const actor=await requireLocalUser(request);
  if (!actor.ok) return {error:json({error:"Niet ingelogd."},401)};
  if (write && !isProtectedAdminEmail(actor.user.email) && !canWriteTab(actor.profile.role,"implementation",await readLocalRoleTabAccess())) return {error:json({error:"Geen schrijfrechten."},403)};
  const {implementationId}=await context.params;
  const result=await executeLocalTableQuery({table:"implementations",action:"select",select:"id,deal_id,implementation_customer_work_approvals",filters:[{column:"id",op:"eq",value:implementationId}],maybeSingle:true},{user:actor.user,profile:actor.profile});
  const implementation=result.data as {id:string;deal_id:string;implementation_customer_work_approvals:unknown}|null;
  if(!implementation) return {error:json({error:"Implementatie niet toegankelijk."},404)};
  const {rows}=await query<{accepted_at:string|null;calculator_inputs:Record<string,unknown>}>("select accepted_at,calculator_inputs from public.deals where id=$1",[implementation.deal_id]);
  return {implementation,budget:approvedDays(rows[0]??{}),key:`implementation-budget:${implementation.id}`};
}
export async function GET(request:Request,context:Context) {
 try {
  const state=await access(request,context);if(state.error)return state.error;
  const budgetState = await getImplementationBudgetState(state.implementation!.id);
  return json(budgetState);
 } catch {return json({error:"Dagenbegroting laden mislukt."},500);}
}
export async function PUT(request:Request,context:Context) {
 try {
  const state=await access(request,context,true);if(state.error)return state.error;
  const body=await request.json();
  if(state.budget===null || state.budget===undefined) return json({error:"Geen controleerbaar dagenbudget uit een goedgekeurde offerte beschikbaar."},400);
  if(body.budget!==state.budget || !validateBudgetRows(body.rows,state.budget)) return json({error:"De som van de begrote dagen moet gelijk zijn aan het goedgekeurde dagenbudget. Vernieuw bij een gewijzigde offerte."},400);
  const current = await getImplementationBudgetState(state.implementation!.id);
  const totalDays = Object.values(body.rows as Record<string, {days:number}>).reduce((sum, row) => sum + row.days, 0);
  if (Math.abs((totalDays - state.budget) * current.hoursPerDay) >= 0.005) return json({error:"Het totaal aantal uren moet overeenkomen met de goedgekeurde offerte."},400);
  const selected = new Set(current.items.map(item => item.key));
  if (current.budget !== body.budget || selected.size !== Object.keys(body.rows).length || Object.keys(body.rows).some(key => !selected.has(key))) {
    return json({error:"De geselecteerde werkzaamheden of offerte zijn gewijzigd. Vernieuw de pagina en controleer de verdeling."},409);
  }
  const version=crypto.randomUUID();
  const payload=JSON.stringify({rows:body.rows,version,budget:state.budget});
  const result=body.version===null
   ? await query("insert into public.app_settings (key,payload) values ($1,$2::jsonb) on conflict (key) do nothing returning key",[state.key,payload])
   : await query("update public.app_settings set payload=$2::jsonb,updated_at=now() where key=$1 and payload->>'version'=$3 returning key",[state.key,payload,body.version]);
  if(!result.rows.length)return json({error:"Deze begroting is intussen gewijzigd. Vernieuw de pagina."},409);
  return json({version});
 } catch {return json({error:"Dagenbegroting opslaan mislukt."},500);}
}
