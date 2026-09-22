import {NextResponse} from "next/server";
import {requireLocalUser} from "@/lib/local-auth";
import {executeLocalTableQuery} from "@/lib/local-table";
import {getImplementationForecast} from "@/lib/implementation-forecast-server";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{implementationId:string}>}){
 const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
 try{
  const actor=await requireLocalUser(request);if(!actor.ok)return json({error:"Niet ingelogd."},401);
  const {implementationId}=await context.params;
  const access=await executeLocalTableQuery({table:"implementations",action:"select",select:"id",filters:[{column:"id",op:"eq",value:implementationId}],maybeSingle:true},{user:actor.user,profile:actor.profile});
  if(!access.data)return json({error:"Implementatie niet toegankelijk."},404);
  return json(await getImplementationForecast(implementationId));
 }catch{return json({error:"Prognose tijdelijk niet beschikbaar."},500);}
}
