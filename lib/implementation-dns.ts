import { resolveCname, resolveTxt } from "node:dns/promises";

export const IMPLEMENTATION_DNS_RECORDS = {
  spfSmartsoft: "include:_spf.smartsoft.nu",
  spfTroublefree: "include:_spf.troublefreehosting.nl",
  dkimSmartsoftName: "smtp01-smartsoft._domainkey",
  dkimSmartsoftTarget: "smtp01._domainkey.smartsoft.nu",
  dkimTroublefreeName: "smtp02-tfh._domainkey",
  dkimTroublefreeTarget: "smtp02-tfh._domainkey.troublefreehosting.nl",
} as const;

export type DnsCheckStatus = "pass" | "fail" | "error";

export type DnsCheckItem = {
  status: DnsCheckStatus;
  message: string;
};

export type ImplementationDnsCheck = {
  domain: string;
  checkedAt: string;
  checks: {
    spfSmartsoft: DnsCheckItem;
    spfTroublefree: DnsCheckItem;
    dkimSmartsoft: DnsCheckItem;
    dkimTroublefree: DnsCheckItem;
  };
};

export function implementationWebsiteDomain(website: string) {
  const value = website.trim();
  if (!value) return "";

  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    const domain = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    const labels = domain.split(".");
    if (
      domain.length > 253
      || labels.length < 2
      || labels.some((label) => (
        !label
        || label.length > 63
        || !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label)
      ))
    ) return "";
    return domain;
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
      smartsoft: item(IMPLEMENTATION_DNS_RECORDS.spfSmartsoft),
      troublefree: item(IMPLEMENTATION_DNS_RECORDS.spfTroublefree),
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

async function checkCname(
  domain: string,
  recordName: string,
  expectedTarget: string,
): Promise<DnsCheckItem> {
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

export async function checkImplementationDns(domain: string): Promise<ImplementationDnsCheck> {
  const normalizedDomain = normalizeDnsName(domain).replace(/^www\./, "");
  const [spf, dkimSmartsoft, dkimTroublefree] = await Promise.all([
    checkSpf(normalizedDomain),
    checkCname(
      normalizedDomain,
      IMPLEMENTATION_DNS_RECORDS.dkimSmartsoftName,
      IMPLEMENTATION_DNS_RECORDS.dkimSmartsoftTarget,
    ),
    checkCname(
      normalizedDomain,
      IMPLEMENTATION_DNS_RECORDS.dkimTroublefreeName,
      IMPLEMENTATION_DNS_RECORDS.dkimTroublefreeTarget,
    ),
  ]);

  return {
    domain: normalizedDomain,
    checkedAt: new Date().toISOString(),
    checks: {
      spfSmartsoft: spf.smartsoft,
      spfTroublefree: spf.troublefree,
      dkimSmartsoft,
      dkimTroublefree,
    },
  };
}
