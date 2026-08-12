import { NextResponse } from "next/server";
import { getServiceClient, type ServiceClient } from "@/lib/admin-api";
import {
  buildMailchimpPreview,
  synchronizeMailchimp,
  type MailchimpSyncFailure,
} from "@/lib/mailchimp";
import {
  readMailchimpSettings,
  writeMailchimpSettings,
  type MailchimpSyncSettings,
} from "@/lib/mailchimp-settings-storage";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { ensureProtectedAdminRole } from "@/lib/protected-admin-server";
import { canAccessTab, canWriteTab } from "@/lib/role-tabs";
import { readRoleTabAccess } from "@/lib/role-tab-access-storage";
import {
  getMailchimpContactsRefreshStatus,
  getMailchimpContactsSnapshot,
  startMailchimpContactsRefresh,
  type SmartTradeMailchimpSource,
} from "@/lib/smart-trade-api";
import type { UserRole } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMPTY_SOURCE = {
  contacts: [],
  relationCount: 0,
  contactPersonCount: 0,
  contactPersonErrorCount: 0,
  invalidEmailCount: 0,
  conflictCount: 0,
  tags: [],
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function syncFailures(value: unknown): MailchimpSyncFailure[] {
  if (!value || typeof value !== "object") return [];
  const failures = (value as { failures?: unknown }).failures;
  if (!Array.isArray(failures)) return [];
  return failures.flatMap((failure) => {
    if (!failure || typeof failure !== "object") return [];
    const email = typeof (failure as { email?: unknown }).email === "string"
      ? (failure as { email: string }).email.trim().toLowerCase()
      : "";
    const error = typeof (failure as { error?: unknown }).error === "string"
      ? (failure as { error: string }).error.trim()
      : "";
    return email && error ? [{ email, error }] : [];
  });
}

function removeFailuresMissingFromSmartTrade(
  settings: MailchimpSyncSettings,
  source: SmartTradeMailchimpSource,
) {
  const failures = syncFailures(settings.lastSyncResult);
  if (!failures.length || !settings.lastSyncResult) return settings;

  const currentEmails = new Set(source.contacts.map((contact) => contact.email.trim().toLowerCase()));
  const currentFailures = failures.filter((failure) => currentEmails.has(failure.email));
  if (currentFailures.length === failures.length) return settings;

  return {
    ...settings,
    lastSyncResult: {
      ...settings.lastSyncResult,
      failed: currentFailures.length,
      failures: currentFailures,
    },
  };
}

async function verifyMailchimpAccess(request: Request, service: ServiceClient, write = false) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return { ok: false as const, message: "Niet ingelogd." };

  const { data: userData, error: userError } = await service.auth.getUser(token);
  if (userError || !userData.user) return { ok: false as const, message: "Ongeldige sessie." };
  await ensureProtectedAdminRole(service, userData.user);

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!isProtectedAdminEmail(userData.user.email) && (profileError || !profile)) {
    return { ok: false as const, message: "Geen toegang." };
  }

  const role = isProtectedAdminEmail(userData.user.email)
    ? "admin"
    : ((profile as { role?: UserRole } | null)?.role ?? null);
  const access = await readRoleTabAccess(service);
  const allowed = write ? canWriteTab(role, "mailchimp", access) : canAccessTab(role, "mailchimp", access);
  return allowed
    ? { ok: true as const }
    : { ok: false as const, message: write ? "Geen schrijfrechten voor Mailchimp." : "Geen toegang tot Mailchimp." };
}

export async function GET(request: Request) {
  try {
    const service = getServiceClient();
    if (!service) return jsonResponse({ error: "Serverconfiguratie ontbreekt." }, 500);
    const verified = await verifyMailchimpAccess(request, service);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 403);

    const settings = await readMailchimpSettings(service);
    const searchParams = new URL(request.url).searchParams;
    const mode = searchParams.get("mode");
    if (mode === "connection") {
      return jsonResponse(await buildMailchimpPreview(EMPTY_SOURCE, settings, { includeMembers: false }));
    }
    if (mode === "status") {
      return jsonResponse({ refresh: await getMailchimpContactsRefreshStatus() });
    }
    if (mode === "start") {
      return jsonResponse({
        refresh: await startMailchimpContactsRefresh({ forceRefresh: searchParams.get("refresh") === "1" }),
      }, 202);
    }

    const source = await getMailchimpContactsSnapshot();
    if (!source) {
      return jsonResponse({
        error: "De eerste Smart Trade-controle is nog bezig.",
        refresh: await startMailchimpContactsRefresh(),
      }, 202);
    }
    return jsonResponse(await buildMailchimpPreview(
      source,
      removeFailuresMissingFromSmartTrade(settings, source),
    ));
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Mailchimp-voorvertoning laden mislukt." }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const service = getServiceClient();
    if (!service) return jsonResponse({ error: "Serverconfiguratie ontbreekt." }, 500);
    const verified = await verifyMailchimpAccess(request, service, true);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 403);

    const body = await request.json().catch(() => null) as {
      action?: unknown;
      audienceId?: unknown;
      emails?: unknown;
    } | null;
    const action = body?.action === "sync"
      ? "sync"
      : body?.action === "retryFailures"
        ? "retryFailures"
        : "selectAudience";
    const audienceId = typeof body?.audienceId === "string" ? body.audienceId.trim() : "";
    if (!audienceId) return jsonResponse({ error: "Selecteer eerst een Mailchimp-publiek." }, 400);

    const currentSettings = await readMailchimpSettings(service);
    const selectedSettings = { ...currentSettings, audienceId };
    if (action === "selectAudience") {
      await writeMailchimpSettings(service, selectedSettings);
      const source = await getMailchimpContactsSnapshot();
      const previewSettings = source
        ? removeFailuresMissingFromSmartTrade(selectedSettings, source)
        : selectedSettings;
      return jsonResponse(await buildMailchimpPreview(source ?? EMPTY_SOURCE, previewSettings));
    }

    const refresh = await getMailchimpContactsRefreshStatus();
    const source = await getMailchimpContactsSnapshot();
    if (!source || refresh.state === "running") {
      return jsonResponse({
        error: "Wacht tot de volledige Smart Trade-controle klaar is voordat je synchroniseert.",
      }, 409);
    }
    if (refresh.state === "error") {
      return jsonResponse({ error: refresh.error || "De Smart Trade-controle is mislukt." }, 409);
    }
    if (source.contactPersonErrorCount > 0) {
      return jsonResponse({
        error: `Synchronisatie geblokkeerd: bij ${source.contactPersonErrorCount} relaties konden de contactpersonen niet volledig worden opgehaald. Vernieuw het voorbeeld en probeer het opnieuw.`,
      }, 409);
    }
    const activeSettings = removeFailuresMissingFromSmartTrade(selectedSettings, source);
    const previousFailures = syncFailures(activeSettings.lastSyncResult);
    const requestedEmails = action === "retryFailures" && Array.isArray(body?.emails)
      ? Array.from(new Set(body.emails.map((email) => String(email).trim().toLowerCase()).filter(Boolean)))
      : [];
    if (action === "retryFailures" && requestedEmails.length === 0) {
      return jsonResponse({ error: "Selecteer minimaal één mislukt e-mailadres." }, 400);
    }
    const knownFailureEmails = new Set(previousFailures.map((failure) => failure.email));
    const retryEmails = action === "retryFailures"
      ? requestedEmails.filter((email) => knownFailureEmails.has(email))
      : [];
    if (action === "retryFailures" && retryEmails.length === 0) {
      return jsonResponse({ error: "Deze fout is inmiddels niet meer aanwezig. Vernieuw het overzicht." }, 409);
    }

    const result = await synchronizeMailchimp(
      source,
      activeSettings,
      action === "retryFailures" ? { onlyEmails: retryEmails } : {},
    );
    const retrySet = new Set(retryEmails);
    const unresolvedFailures = action === "retryFailures"
      ? [
          ...previousFailures.filter((failure) => !retrySet.has(failure.email)),
          ...result.failures,
        ]
      : result.failures;
    const failedRetryEmails = new Set(result.failures.map((failure) => failure.email));
    const storedResult = action === "retryFailures"
      ? {
          ...result,
          failed: unresolvedFailures.length,
          failures: unresolvedFailures,
          retry: true,
          retried: retryEmails.length,
          resolved: retryEmails.filter((email) => !failedRetryEmails.has(email)).length,
        }
      : result;
    const lastSyncAt = new Date().toISOString();
    const nextSettings = await writeMailchimpSettings(service, {
      audienceId,
      managedTags: result.managedTags,
      previousEmails: result.previousEmails,
      lastSyncAt,
      lastSyncResult: storedResult,
    });
    const preview = await buildMailchimpPreview(source, nextSettings);
    return jsonResponse({ ...preview, syncResult: storedResult });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Mailchimp-synchronisatie mislukt." }, 500);
  }
}
