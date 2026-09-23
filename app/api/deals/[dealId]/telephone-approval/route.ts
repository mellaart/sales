import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { recordTelephoneDealApproval } from "@/lib/deal-approval-server";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: {params: Promise<{dealId: string}>}) {
  const json = (body: unknown, status=200) => NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
  try {
    const actor = await requireLocalUser(request);
    if (!actor.ok) return json({error:"Niet ingelogd."},401);
    if (!isProtectedAdminEmail(actor.user.email)) return json({error:"Geen toegang tot telefonisch akkoord vastleggen."},403);
    const body = await request.json().catch(()=>null);
    if (body?.confirmed !== true) return json({error:"Bevestig dat de klant telefonisch akkoord heeft gegeven."},400);
    const {dealId} = await context.params;
    return json({deal:await recordTelephoneDealApproval(dealId,actor)});
  } catch { return json({error:"Telefonisch akkoord vastleggen mislukt. Vernieuw de deal en probeer opnieuw."},500); }
}
