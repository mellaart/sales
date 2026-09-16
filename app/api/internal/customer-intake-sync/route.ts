import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { deliverPendingApprovalNotifications } from "@/lib/deal-approval-notification";
import { syncPendingCustomerIntakes } from "@/lib/customer-intake-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function configuredSecret() {
  const environmentSecret = (
    process.env.SALES_CUSTOMER_INTAKE_CRON_SECRET ||
    process.env.SALES_MAILCHIMP_CRON_SECRET ||
    ""
  ).trim();
  if (environmentSecret) return environmentSecret;

  const secretFile = (
    process.env.SALES_CUSTOMER_INTAKE_CRON_SECRET_FILE ||
    process.env.SALES_MAILCHIMP_CRON_SECRET_FILE ||
    join(process.cwd(), ".mailchimp-cron-secret")
  ).trim();
  try {
    return readFileSync(secretFile, "utf8").trim();
  } catch {
    return "";
  }
}

function authorized(request: Request) {
  const secret = configuredSecret();
  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!secret || !provided) return false;

  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function POST(request: Request) {
  if (!authorized(request)) return jsonResponse({ error: "Niet toegestaan." }, 401);

  try {
    const approvalNotifications = await deliverPendingApprovalNotifications().catch(error => {
      console.error("Akkoordmeldingen verwerken mislukt:", error);
      return { sent: 0, failed: 1 };
    });
    const result = await syncPendingCustomerIntakes();
    return jsonResponse({ ok: result.failed === 0 && approvalNotifications.failed === 0, ...result, approvalNotifications }, result.failed > 0 || approvalNotifications.failed > 0 ? 207 : 200);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error
        ? error.message
        : "Automatische verwerking van klantformulieren mislukt.",
    }, 500);
  }
}
