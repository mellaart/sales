import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import {
  getOutlookConnectionStatus,
  getOutlookConnectUrl,
} from "@/lib/outlook-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message }, { status: 401 });
    }

    const returnTo = new URL(request.url).searchParams.get("returnTo");
    const status = await getOutlookConnectionStatus(verified.user.id);
    return NextResponse.json(
      {
        ...status,
        connectUrl: getOutlookConnectUrl(request, returnTo),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Outlook-status laden mislukt." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
