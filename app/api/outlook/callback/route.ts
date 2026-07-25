import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import {
  completeOutlookAuthorization,
  outlookRequestOrigin,
} from "@/lib/outlook-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function callbackError(message: string) {
  return new NextResponse(
    `<!doctype html>
<html lang="nl">
  <head><meta charset="utf-8"><title>Outlook verbinden</title></head>
  <body style="font-family:Arial,sans-serif;padding:32px;color:#172033">
    <h1>Outlook verbinden is niet gelukt</h1>
    <p>${message.replace(/[<>&"]/g, "")}</p>
    <p>Sluit dit venster en probeer het opnieuw vanuit de deal.</p>
  </body>
</html>`,
    {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}

export async function GET(request: Request) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) return NextResponse.redirect(new URL("/login", request.url));

    const url = new URL(request.url);
    const state = url.searchParams.get("state")?.trim() ?? "";
    const code = url.searchParams.get("code")?.trim() ?? "";
    const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");

    if (oauthError) return callbackError(oauthError);
    if (!state || !code) return callbackError("Microsoft heeft geen geldige bevestiging teruggegeven.");

    const returnTo = await completeOutlookAuthorization(
      request,
      verified.user.id,
      code,
      state,
    );
    const redirectUrl = new URL(returnTo, outlookRequestOrigin(request));
    redirectUrl.searchParams.set("outlook", "connected");

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    return callbackError(
      error instanceof Error ? error.message : "Outlook verbinden mislukt.",
    );
  }
}
