import type { PoolClient } from "pg";
import { query, withTransaction } from "@/lib/local-db";
import { getDealRelationId } from "@/lib/deal-relation";
import { getAssetsWithModulesForRelation } from "@/lib/smart-trade-api";

const BASE = "https://admin.smarttrade.nu/api/companies";
const PREFIX = "admin-tool-license:";
export type LicenseJob = {
  status: "pending" | "applying" | "synced" | "review";
  dealId: string; relationId: number | null; quantity: number;
  administration?: string; companyId?: number; previous?: number; target?: number;
  message?: string; completedAt?: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function purchasedRegularUsers(inputs: unknown) {
  const expansion = record(record(inputs).assetsExpansion);
  if (!Array.isArray(expansion.lines)) return 0;
  let total = 0;
  for (const raw of expansion.lines) {
    const line = record(raw);
    if (line.group !== "Gebruikers" || line.cadence !== "monthly" ||
      !/^Smart Trade (Lite|Starter|Basic|Premium|Enterprise) Extra gebruiker$/.test(String(line.label))) continue;
    const quantity = Number(line.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) throw new Error("Ongeldig aantal extra gebruikers.");
    total += quantity;
  }
  if (total > 1000) throw new Error("Ongeldig aantal extra gebruikers.");
  return total;
}

// Enqueued inside the acceptance transaction: no historical deals are backfilled.
export async function queueLicenseIncrease(client: Pick<PoolClient, "query">, deal: {
  id: string; calculator_inputs: unknown; smart_trade_relation_id?: unknown;
}) {
  const quantity = purchasedRegularUsers(deal.calculator_inputs);
  if (!quantity) return;
  const job: LicenseJob = { status: "pending", dealId: deal.id, relationId: getDealRelationId(deal), quantity };
  await client.query("insert into public.app_settings (key,payload) values ($1,$2::jsonb) on conflict (key) do nothing",
    [PREFIX + deal.id, JSON.stringify(job)]);
}

function integer(value: unknown) {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+$/.test(value))) throw new Error("Ongeldig gebruikerslimiet in admintool.");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("Ongeldig gebruikerslimiet in admintool.");
  return n;
}

async function api(url: string, method = "GET", target?: number) {
  const token = process.env.ADMIN_TOOL_API_TOKEN?.trim();
  if (!token) throw new Error("ADMIN_TOOL_API_TOKEN ontbreekt op de server.");
  let response: Response;
  try {
    response = await fetch(url, { method, redirect: "error", cache: "no-store",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(target === undefined ? {} : { body: JSON.stringify({ system_max_users: String(target) }) }),
      signal: AbortSignal.timeout(15000) });
  } catch { throw new Error("Admintool niet bereikbaar of antwoord niet ontvangen."); }
  // Never expose upstream response text, URLs, or authorization headers in logs/UI.
  if (!response.ok) throw new Error(`Admintool geeft HTTP ${response.status}.`);
  if (method === "PUT") return null;
  try { return await response.json(); } catch { throw new Error("Ongeldig antwoord van admintool."); }
}

type Company = { id: number; company: string; system_max_users: unknown };
export async function listCompanies(): Promise<Company[]> {
  const companies: Company[] = [];
  let url: string | null = BASE;
  const visited = new Set<string>();
  while (url) {
    if (visited.has(url) || visited.size >= 1000) throw new Error("Ongeldige paginering van admintool.");
    visited.add(url);
    const body = record(await api(url));
    if (!Array.isArray(body.data)) throw new Error("Bedrijvenlijst ontbreekt in admintool.");
    for (const raw of body.data) {
      const row = record(raw);
      const id = integer(row.id);
      if (!id || typeof row.company !== "string") throw new Error("Ongeldig bedrijf in admintool.");
      companies.push({ id, company: row.company, system_max_users: row.system_max_users });
    }
    const next = record(body.links).next;
    if (next == null) { url = null; continue; }
    if (typeof next !== "string") throw new Error("Ongeldige vervolgpagina.");
    const parsed = new URL(next, BASE);
    const base = new URL(BASE);
    if (parsed.origin !== base.origin || parsed.pathname !== base.pathname || parsed.username || parsed.password)
      throw new Error("Onveilige vervolgpagina van admintool.");
    url = parsed.href;
  }
  return companies;
}

export function matchCompany(assets: {name: string}[], companies: Company[]) {
  // Match exact administration suffixes against company names; descriptive parentheses
  // such as '(chauffeursmodule)' never become an administration by themselves.
  const suffixes = new Set(assets.flatMap(asset => {
    const match = asset.name.match(/\(([^()]+)\)(?:\s*\(\d+\))?\s*$/);
    return match ? [match[1].trim().toLowerCase()] : [];
  }));
  const matches = companies.filter(company => suffixes.has(company.company.trim().toLowerCase()));
  if (matches.length !== 1) throw new Error("Administratie uit de assets niet eenduidig gevonden in de admintool.");
  return matches[0];
}

export async function getLicenseSync(dealId: string): Promise<LicenseJob | null> {
  const { rows } = await query<{payload: LicenseJob}>("select payload from public.app_settings where key=$1", [PREFIX + dealId]);
  return rows[0]?.payload ?? null;
}

export async function syncLicenseIncreases(dealId?: string) {
  const { rows } = await query<{key: string; payload: LicenseJob}>(
    "select key,payload from public.app_settings where key like 'admin-tool-license:%' and payload->>'status'='pending' and ($1::text is null or key=$1) order by updated_at, key limit 10",
    [dealId ? PREFIX + dealId : null]);
  let synced = 0, failed = 0;
  for (const row of rows) {
    let claimed: LicenseJob | null = null;
    try {
      if (!row.payload.relationId) throw new Error("Klantrelatie ontbreekt bij deze verkoop.");
      const assets = await getAssetsWithModulesForRelation(row.payload.relationId);
      const company = matchCompany(assets, await listCompanies());
      // Persistent company lock survives process failure. Commit the exact target BEFORE
      // sending PUT, so a lost response can never result in a second increment.
      claimed = await withTransaction(async client => {
        const locked = await client.query<{payload: LicenseJob}>("select payload from public.app_settings where key=$1 for update", [row.key]);
        const job = locked.rows[0]?.payload;
        if (!job || job.status !== "pending") return null;
        const lock = await client.query("insert into public.app_settings (key,payload) values ($1,$2::jsonb) on conflict (key) do nothing returning key",
          [`admin-tool-company-lock:${company.id}`, JSON.stringify({dealId:job.dealId})]);
        if (!lock.rows.length) throw new Error("Een andere verkoop voor deze administratie wordt verwerkt of vereist controle.");
        // Re-read while holding the company lock; another sale may have completed since discovery.
        const current = (await listCompanies()).find(item => item.id === company.id);
        if (!current || current.company !== company.company) throw new Error("Administratie is gewijzigd in de admintool.");
        const previous = integer(current.system_max_users);
        const target = previous + job.quantity;
        if (!Number.isSafeInteger(target)) throw new Error("Ongeldig nieuw gebruikerslimiet.");
        const next: LicenseJob = { ...job, status: "applying", companyId:company.id,
          administration:company.company, previous, target, message:"Verhoging gestart; bij onderbreking is controle nodig." };
        await client.query("update public.app_settings set payload=$2::jsonb,updated_at=now() where key=$1", [row.key,JSON.stringify(next)]);
        return next;
      });
      if (!claimed) continue;
      await api(`${BASE}/${claimed.companyId}`, "PUT", claimed.target);
      const verified = (await listCompanies()).find(item => item.id === claimed!.companyId);
      if (!verified || integer(verified.system_max_users) !== claimed.target) throw new Error("Nieuw gebruikerslimiet kon niet worden bevestigd.");
      await withTransaction(async client => {
        await client.query("update public.app_settings set payload=$2::jsonb,updated_at=now() where key=$1",
          [row.key,JSON.stringify({...claimed,status:"synced",message:"Gebruikerslimiet verhoogd en gecontroleerd.",completedAt:new Date().toISOString()})]);
        await client.query("delete from public.app_settings where key=$1 and payload->>'dealId'=$2", [`admin-tool-company-lock:${claimed!.companyId}`,claimed!.dealId]);
      });
      synced++;
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : "Verwerking admintool mislukt.";
      if (claimed) {
        await query("update public.app_settings set payload=$2::jsonb,updated_at=now() where key=$1", [row.key,JSON.stringify({...claimed,status:"review",message:`Controle nodig: ${message} Niet automatisch opnieuw uitgevoerd.`})]);
      } else {
        await query("update public.app_settings set payload=payload || $2::jsonb,updated_at=now() where key=$1 and payload->>'status'='pending'", [row.key,JSON.stringify({message})]);
      }
    }
  }
  return {synced,failed};
}
