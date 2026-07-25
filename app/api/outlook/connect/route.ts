import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import { createOutlookAuthorizationUrl } from "@/lib/outlook-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const returnTo = new URL(request.url).searchParams.get("returnTo");
    const authorizationUrl = await createOutlookAuthorizationUrl(
      request,
      verified.user.id,
      returnTo,
    );

    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    return new NextResponse(
      error instanceof Error ? error.message : "Outlook verbinden mislukt.",
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      },
    );
  }
}
