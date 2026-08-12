import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin-api";
import { synchronizeMailchimp } from "@/lib/mailchimp";
import { readMailchimpSettings, writeMailchimpSettings } from "@/lib/mailchimp-settings-storage";
import { getMailchimpContacts } from "@/lib/smart-trade-api";

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
  const environmentSecret = process.env.SALES_MAILCHIMP_CRON_SECRET?.trim();
  if (environmentSecret) return environmentSecret;

  const secretFile = process.env.SALES_MAILCHIMP_CRON_SECRET_FILE?.trim()
    || join(process.cwd(), ".mailchimp-cron-secret");
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
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function POST(request: Request) {
  if (!authorized(request)) return jsonResponse({ error: "Niet toegestaan." }, 401);

  try {
    const service = getServiceClient();
    if (!service) return jsonResponse({ error: "Serverconfiguratie ontbreekt." }, 500);

    const settings = await readMailchimpSettings(service);
    if (!settings.audienceId && !process.env.MAILCHIMP_AUDIENCE_ID?.trim()) {
      return jsonResponse({ error: "Selecteer eerst op de Mailchimp-pagina een publiek." }, 409);
    }

    const source = await getMailchimpContacts({ forceRefresh: true });
    if (source.contactPersonErrorCount > 0) {
      return jsonResponse({
        error: `Synchronisatie geblokkeerd: bij ${source.contactPersonErrorCount} relaties konden de contactpersonen niet volledig worden opgehaald.`,
      }, 409);
    }

    const result = await synchronizeMailchimp(source, settings);
    const lastSyncAt = new Date().toISOString();
    const storedResult = { ...result, trigger: "nightly" };
    await writeMailchimpSettings(service, {
      audienceId: result.audienceId,
      managedTags: result.managedTags,
      previousEmails: result.previousEmails,
      lastSyncAt,
      lastSyncResult: storedResult,
    });

    return jsonResponse({
      ok: true,
      lastSyncAt,
      audience: result.audienceName,
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      blocked: result.blocked,
      tagsRemoved: result.tagsRemoved,
      failed: result.failed,
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Nachtelijke Mailchimp-synchronisatie mislukt.",
    }, 500);
  }
}
