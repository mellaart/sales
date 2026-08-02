import { resolveCname, resolveTxt } from "node:dns/promises";
import { NextResponse } from "next/server";
import { normalizeCustomerIntakeData } from "@/lib/customer-intake";
import { requireLocalUser } from "@/lib/local-auth";
import { query } from "@/lib/local-db";
import { executeLocalTableQuery } from "@/lib/local-table";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SPF_SMARTSOFT = "include:_spf.smartsoft.nu";
const SPF_TROUBLEFREE = "include:_spf.troublefreehosting.nl";
const DKIM_SMARTSOFT_NAME = "smtp01-smartsoft._domainkey";
const DKIM_SMARTSOFT_TARGET = "smtp01._domainkey.smartsoft.nu";
const DKIM_TROUBLEFREE_NAME = "smtp02-tfh._domainkey";
const DKIM_TROUBLEFREE_TARGET = "smtp02-tfh._domainkey.troublefreehosting.nl";

type DnsCheckStatus = "pass" | "fail" | "error";

type DnsCheckItem = {
  status: DnsCheckStatus;
  message: string;
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function websiteDomain(website: string) {
  const value = website.trim();
  if (!value) return "";

  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return "";
  }
}

function normalizeDnsName(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function dnsErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}

function isMissingDnsRecord(error: unknown) {
  return ["ENODATA", "ENOTFOUND", "ENONAME", "NXDOMAIN"].includes(dnsErrorCode(error));
}

function errorMessage(recordType: string) {
  return `${recordType}-controle kon de DNS-server niet bereiken. Probeer de controle opnieuw.`;
}

async function checkSpf(domain: string) {
  try {
    const records = await resolveTxt(domain);
    const spfRecords = records
      .map((parts) => parts.join(""))
      .filter((record) => /^v=spf1(?:\s|$)/i.test(record));

    function item(expected: string): DnsCheckItem {
      if (spfRecords.some((record) => record.toLowerCase().includes(expected.toLowerCase()))) {
        return { status: "pass", message: "Aanwezig in het SPF-record." };
      }
      return {
        status: "fail",
        message: spfRecords.length > 0 ? "Ontbreekt in het SPF-record." : "Geen SPF-record gevonden.",
      };
    }

    return {
      smartsoft: item(SPF_SMARTSOFT),
      troublefree: item(SPF_TROUBLEFREE),
    };
  } catch (error) {
    const status: DnsCheckStatus = isMissingDnsRecord(error) ? "fail" : "error";
    const message = status === "fail" ? "Geen SPF-record gevonden." : errorMessage("SPF");
    return {
      smartsoft: { status, message },
      troublefree: { status, message },
    };
  }
}

async function checkCname(domain: string, recordName: string, expectedTarget: string): Promise<DnsCheckItem> {
  try {
    const targets = (await resolveCname(`${recordName}.${domain}`)).map(normalizeDnsName);
    if (targets.includes(normalizeDnsName(expectedTarget))) {
      return { status: "pass", message: "CNAME-record is correct ingesteld." };
    }
    return {
      status: "fail",
      message: targets.length > 0
        ? `Andere waarde gevonden: ${targets.join(", ")}`
        : "CNAME-record niet gevonden.",
    };
  } catch (error) {
    if (isMissingDnsRecord(error)) {
      return { status: "fail", message: "CNAME-record niet gevonden." };
    }
    return { status: "error", message: errorMessage("DKIM") };
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ implementationId: string }> },
) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);

    const { implementationId } = await context.params;
    const access = await executeLocalTableQuery({
      table: "implementations",
      action: "select",
      select: "id,deal_id",
      filters: [{ column: "id", op: "eq", value: implementationId }],
      maybeSingle: true,
    }, {
      user: verified.user,
      profile: verified.profile,
    });

    const implementation = access.data as { deal_id?: string } | null;
    if (!implementation?.deal_id) {
      return jsonResponse({ error: "Implementatie niet gevonden of niet toegankelijk." }, 404);
    }

    const { rows } = await query<{ form_data: unknown; submitted_at: string | null }>(
      `select form_data, submitted_at
       from public.customer_intakes
       where deal_id = $1
       limit 1`,
      [implementation.deal_id],
    );
    const intake = rows[0];
    if (!intake?.submitted_at) {
      return jsonResponse({ error: "De klantgegevens moeten eerst ontvangen zijn." }, 409);
    }

    const domain = websiteDomain(normalizeCustomerIntakeData(intake.form_data).website);
    if (!domain) {
      return jsonResponse({ error: "In het klantgegevensformulier ontbreekt een geldige website." }, 409);
    }

    const [spf, dkimSmartsoft, dkimTroublefree] = await Promise.all([
      checkSpf(domain),
      checkCname(domain, DKIM_SMARTSOFT_NAME, DKIM_SMARTSOFT_TARGET),
      checkCname(domain, DKIM_TROUBLEFREE_NAME, DKIM_TROUBLEFREE_TARGET),
    ]);

    return jsonResponse({
      domain,
      checkedAt: new Date().toISOString(),
      checks: {
        spfSmartsoft: spf.smartsoft,
        spfTroublefree: spf.troublefree,
        dkimSmartsoft,
        dkimTroublefree,
      },
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "DNS-controle mislukt.",
    }, 500);
  }
}
