import { getDealRelationId } from "@/lib/deal-relation";
import {NextResponse} from "next/server";
import {requireLocalUser} from "@/lib/local-auth";
import {executeLocalTableQuery} from "@/lib/local-table";
import {query} from "@/lib/local-db";
import {isProtectedAdminEmail} from "@/lib/protected-admin";
import {getImplementationOrderBreakdown,getImplementationModuleOrders} from "@/lib/implementation-order";
import {createImplementationOrderBatch, type CreatedModuleOrder} from "@/lib/implementation-order-batch";
import {readStoredPricingConfig} from "@/lib/price-settings-storage";
import {getServiceClient} from "@/lib/admin-api";
export const dynamic="force-dynamic";
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
type Context={params:Promise<{dealId:string}>};
async function load(request:Request,context:Context){
 const actor=await requireLocalUser(request);if(!actor.ok)return {error:json({error:"Niet ingelogd."},401)};
 if(!isProtectedAdminEmail(actor.user.email))return {error:json({error:"Geen rechten om orders te verwerken."},403)};
 const {dealId}=await context.params;
 const result=await executeLocalTableQuery({table:"deals",action:"select",select:"id,accepted_at,smart_trade_relation_id,package_name,modules,implementation_total,calculator_inputs",filters:[{column:"id",op:"eq",value:dealId}],maybeSingle:true},{user:actor.user,profile:actor.profile});
 const deal=result.data as {id:string;accepted_at:string|null;smart_trade_relation_id:number|null;package_name:string;modules:unknown;implementation_total:number;calculator_inputs:unknown}|null;
 if(!deal)return {error:json({error:"Deal niet toegankelijk."},404)};
 deal.smart_trade_relation_id=getDealRelationId(deal);
 const existing=await query<{id:string;smart_trade_order_id:string|null}>("select id,smart_trade_order_id from public.implementations where deal_id=$1 limit 1",[dealId]);
 const saved=await query<{payload:{orderId?:string;status?:string;orders?:CreatedModuleOrder[]}}>("select payload from public.app_settings where key=$1",[`deal-order:${dealId}`]);
 return {actor,deal,implementation:existing.rows[0] as {id:string;smart_trade_order_id:string|null}|undefined,saved:(saved.rows[0]?.payload as {orderId?:string;status?:string;orders?:CreatedModuleOrder[]}|undefined),key:`deal-order:${dealId}`};
}
export async function GET(request:Request,context:Context){
 try{const state=await load(request,context);if(state.error)return state.error;return json({orderId:state.implementation?.smart_trade_order_id??state.saved?.orderId??null,pending:state.saved?.status==="pending",orders:state.saved?.orders??[],implementationId:state.implementation?.id??null});}catch{return json({error:"Orderstatus laden mislukt."},500);}
}
export async function POST(request:Request,context:Context){
 try{
 const state=await load(request,context);if(state.error)return state.error;
 const {deal}=state;
 if(state.implementation)return json({error:"Verwerk de order via het gekoppelde implementatiedossier."},409);
 if(!deal.accepted_at)return json({error:"De klant moet eerst akkoord geven."},409);
 if(state.saved)return json({error:state.saved.orderId?`Order ${state.saved.orderId} is al aangemaakt.`:"Een eerdere poging moet eerst in Smart Trade worden gecontroleerd."},409);
 const relation=Number(deal.smart_trade_relation_id);if(!Number.isSafeInteger(relation)||relation<=0)return json({error:"Koppel eerst de klantrelatie."},400);
 const breakdown=getImplementationOrderBreakdown(deal);
 if(breakdown.totalAmount<=0)return json({error:"Geen eenmalige kosten: er is geen order nodig."},409);
 if(breakdown.travelAmount>0&&!breakdown.travelArticleId)return json({error:"Controleer de reiskostenregio in de deal."},400);
 const employeeResult=await query<{employee_relation_id:number}>("select employee_relation_id from public.profiles where id=$1",[state.actor!.user.id]);
 const employee=Number(employeeResult.rows[0]?.employee_relation_id);if(!Number.isSafeInteger(employee)||employee<=0)return json({error:"Vul eerst je medewerker relatie-ID in bij Admin."},400);
 const {pricingConfig}=await readStoredPricingConfig(getServiceClient());
 const orders=getImplementationModuleOrders(deal,pricingConfig.modules,pricingConfig.packages,pricingConfig.implementationDayRate);
 const body=await request.json().catch(()=>({}));
 if(body.mode!=="create")return json({orders,total:breakdown.totalAmount,relationId:relation});
 const createdOrders=await createImplementationOrderBatch(state.key,orders.map(order=>({
  debtor:relation,invoiceRelation:relation,employee,deliveryMethod:2,shouldCondseHeader:true,
  reference:order.reference,commentAboveLines:"",lines:order.lines,
 })),state.actor!.user.id);
 return json({orderId:createdOrders.map(order=>order.orderId).join(", "),orders:createdOrders},201);
 }catch(error){return json({error:error instanceof Error?error.message:"Orderaanmaak kon niet worden bevestigd. Controleer Smart Trade voordat je opnieuw probeert."},502);}
}
