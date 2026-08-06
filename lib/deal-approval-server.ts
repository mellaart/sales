import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { canReadAllDeals, isLocalAdmin, type LocalUser } from "@/lib/local-auth";
import { createId, query, withTransaction } from "@/lib/local-db";
import type {
  DealApprovalQuoteSnapshot,
  DealApprovalStatus,
  DealApprovalSummary,
  PublicDealApproval,
} from "@/lib/deal-approval";
import type { ProfileRecord } from "@/lib/supabase";

const DEAL_APPROVAL_TTL_DAYS = 30;

type Actor = {
  user: LocalUser;
  profile: ProfileRecord;
};

type DealRow = {
  id: string;
  user_id: string;
  customer_name: string | null;
  quote_title: string | null;
  contact_name: string | null;
  package_name: string | null;
  total_users: number | null;
  monthly_total: number | null;
  implementation_total: number | null;
  sales_name: string | null;
  modules: unknown;
  calculator_inputs: unknown;
};

type DealApprovalRow = {
  id: string;
  deal_id: string;
  created_by: string | null;
  status: DealApprovalStatus;
  token_version: number;
  recipient_email: string;
  contact_name: string | null;
  quote_snapshot: unknown;
  snapshot_hash: string;
  expires_at: Date | string;
  drafted_at: Date | string | null;
  accepted_at: Date | string | null;
  accepted_by_name: string | null;
  accepted_by_email: string | null;
  accepted_ip: string | null;
  accepted_user_agent: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function signingKey() {
  const key = (
    process.env.SALES_CUSTOMER_FORM_SIGNING_KEY ||
    process.env.SALES_2FA_ENCRYPTION_KEY ||
    ""
  ).trim();

  if (!key) {
    throw new Error(
      "Sleutel voor offerte-akkoord ontbreekt. Voeg SALES_CUSTOMER_FORM_SIGNING_KEY toe aan .env.local.",
    );
  }

  return key;
}

function signaturePayload(id: string, tokenVersion: number) {
  return `smart-trade-deal-approval:${id}:${tokenVersion}`;
}

function signDealApproval(id: string, tokenVersion: number) {
  return createHmac("sha256", signingKey())
    .update(signaturePayload(id, tokenVersion))
    .digest("base64url");
}

export function verifyDealApprovalToken(id: string, tokenVersion: number, token: string) {
  if (!token || !Number.isInteger(tokenVersion) || tokenVersion < 1) return false;

  const expected = Buffer.from(signDealApproval(id, tokenVersion));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function normalizeOrigin(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const url = new URL(request.url);
  const host = forwardedHost || request.headers.get("host") || url.host;
  const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const protocol =
    process.env.NODE_ENV === "production" && !isLocalHost
      ? "https"
      : forwardedProto || url.protocol.replace(":", "") || "https";
  return `${protocol}://${host}`;
}

function getDealApprovalPublicUrl(
  request: Request,
  row: Pick<DealApprovalRow, "id" | "token_version">,
) {
  const url = new URL(`/offerte/${row.id}`, normalizeOrigin(request));
  url.searchParams.set("v", String(row.token_version));
  url.searchParams.set("token", signDealApproval(row.id, row.token_version));
  return url.toString();
}

function asText(value: unknown, maxLength = 240) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isoString(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function quoteSnapshotFromDeal(deal: DealRow): DealApprovalQuoteSnapshot {
  return {
    customerName: asText(deal.customer_name),
    quoteTitle: asText(deal.quote_title) || "Offerte Smart Trade",
    contactName: asText(deal.contact_name),
    packageName: asText(deal.package_name),
    totalUsers: Math.max(0, Math.floor(asNumber(deal.total_users))),
    monthlyTotal: asNumber(deal.monthly_total),
    implementationTotal: asNumber(deal.implementation_total),
    salesName: asText(deal.sales_name),
  };
}

function normalizeQuoteSnapshot(value: unknown): DealApprovalQuoteSnapshot {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    customerName: asText(source.customerName),
    quoteTitle: asText(source.quoteTitle) || "Offerte Smart Trade",
    contactName: asText(source.contactName),
    packageName: asText(source.packageName),
    totalUsers: Math.max(0, Math.floor(asNumber(source.totalUsers))),
    monthlyTotal: asNumber(source.monthlyTotal),
    implementationTotal: asNumber(source.implementationTotal),
    salesName: asText(source.salesName),
  };
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  return value;
}

function snapshotHashFromDeal(deal: DealRow) {
  const evidence = {
    quote: quoteSnapshotFromDeal(deal),
    modules: deal.modules ?? [],
    calculatorInputs: deal.calculator_inputs ?? {},
  };
  return createHash("sha256").update(JSON.stringify(canonicalValue(evidence))).digest("hex");
}

function canManageDeal(actor: Actor, deal: DealRow) {
  return (
    deal.user_id === actor.user.id ||
    canReadAllDeals(actor.profile.role) ||
    isLocalAdmin(actor.profile)
  );
}

function toSummary(request: Request, row: DealApprovalRow): DealApprovalSummary {
  return {
    id: row.id,
    dealId: row.deal_id,
    status: row.status,
    recipientEmail: row.recipient_email,
    contactName: row.contact_name ?? "",
    quote: normalizeQuoteSnapshot(row.quote_snapshot),
    publicUrl: getDealApprovalPublicUrl(request, row),
    expiresAt: isoString(row.expires_at) ?? "",
    draftedAt: isoString(row.drafted_at),
    acceptedAt: isoString(row.accepted_at),
    acceptedByName: row.accepted_by_name ?? "",
    acceptedByEmail: row.accepted_by_email ?? "",
  };
}

function toPublicSummary(row: DealApprovalRow): PublicDealApproval {
  return {
    id: row.id,
    status: row.status,
    recipientEmail: row.recipient_email,
    contactName: row.contact_name ?? "",
    quote: normalizeQuoteSnapshot(row.quote_snapshot),
    expiresAt: isoString(row.expires_at) ?? "",
    acceptedAt: isoString(row.accepted_at),
    acceptedByName: row.accepted_by_name ?? "",
    acceptedByEmail: row.accepted_by_email ?? "",
  };
}

async function getDeal(dealId: string) {
  const { rows } = await query<DealRow>(
    `select id, user_id, customer_name, quote_title, contact_name, package_name,
            total_users, monthly_total, implementation_total, sales_name,
            modules, calculator_inputs
     from public.deals
     where id = $1
     limit 1`,
    [dealId],
  );
  return rows[0] ?? null;
}

export async function prepareDealApproval(
  request: Request,
  dealId: string,
  actor: Actor,
  input: { recipientEmail: string; contactName?: string },
) {
  const recipientEmail = input.recipientEmail.trim().toLowerCase().slice(0, 320);
  const contactName = asText(input.contactName, 200);
  const id = createId();

  const result = await withTransaction(async (client) => {
    const dealResult = await client.query<DealRow>(
      `select id, user_id, customer_name, quote_title, contact_name, package_name,
              total_users, monthly_total, implementation_total, sales_name,
              modules, calculator_inputs
       from public.deals
       where id = $1
       for update`,
      [dealId],
    );
    const deal = dealResult.rows[0];
    if (!deal) throw new Error("Deal niet gevonden.");
    if (!canManageDeal(actor, deal)) throw new Error("Je mag voor deze deal geen offerte versturen.");

    const currentResult = await client.query<DealApprovalRow>(
      `select * from public.deal_approvals where deal_id = $1 for update`,
      [dealId],
    );
    const current = currentResult.rows[0] ?? null;
    const quoteSnapshot = quoteSnapshotFromDeal(deal);
    const snapshotHash = snapshotHashFromDeal(deal);
    const expired = current ? new Date(current.expires_at).getTime() <= Date.now() : false;
    const startsNewRound = Boolean(
      current && (
        current.status !== "open" ||
        expired ||
        current.snapshot_hash !== snapshotHash ||
        current.recipient_email.toLowerCase() !== recipientEmail
      )
    );

    let approvalResult;
    if (!current) {
      approvalResult = await client.query<DealApprovalRow>(
        `insert into public.deal_approvals
          (id, deal_id, created_by, recipient_email, contact_name, quote_snapshot,
           snapshot_hash, expires_at)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7, now() + ($8 * interval '1 day'))
         returning *`,
        [
          id,
          dealId,
          actor.user.id,
          recipientEmail,
          contactName || quoteSnapshot.contactName || null,
          JSON.stringify(quoteSnapshot),
          snapshotHash,
          DEAL_APPROVAL_TTL_DAYS,
        ],
      );
    } else if (startsNewRound) {
      approvalResult = await client.query<DealApprovalRow>(
        `update public.deal_approvals
         set status = 'open',
             token_version = token_version + 1,
             created_by = $2,
             recipient_email = $3,
             contact_name = $4,
             quote_snapshot = $5::jsonb,
             snapshot_hash = $6,
             expires_at = now() + ($7 * interval '1 day'),
             drafted_at = null,
             accepted_at = null,
             accepted_by_name = null,
             accepted_by_email = null,
             accepted_ip = null,
             accepted_user_agent = null,
             updated_at = now()
         where id = $1
         returning *`,
        [
          current.id,
          actor.user.id,
          recipientEmail,
          contactName || quoteSnapshot.contactName || null,
          JSON.stringify(quoteSnapshot),
          snapshotHash,
          DEAL_APPROVAL_TTL_DAYS,
        ],
      );
    } else {
      approvalResult = await client.query<DealApprovalRow>(
        `update public.deal_approvals
         set contact_name = $2,
             quote_snapshot = $3::jsonb,
             updated_at = now()
         where id = $1
         returning *`,
        [
          current.id,
          contactName || quoteSnapshot.contactName || null,
          JSON.stringify(quoteSnapshot),
        ],
      );
    }

    if (!current || startsNewRound) {
      await client.query(
        `update public.deals
         set approval_requested_at = null,
             approval_expires_at = null,
             accepted_at = null,
             accepted_by_name = null,
             accepted_by_email = null
         where id = $1`,
        [dealId],
      );
    }

    return approvalResult.rows[0];
  });

  return toSummary(request, result);
}

export async function markDealApprovalDrafted(
  request: Request,
  dealId: string,
  approvalId: string,
  actor: Actor,
) {
  const result = await withTransaction(async (client) => {
    const dealResult = await client.query<DealRow>(
      `select id, user_id, customer_name, quote_title, contact_name, package_name,
              total_users, monthly_total, implementation_total, sales_name,
              modules, calculator_inputs
       from public.deals
       where id = $1
       for update`,
      [dealId],
    );
    const deal = dealResult.rows[0];
    if (!deal) throw new Error("Deal niet gevonden.");
    if (!canManageDeal(actor, deal)) throw new Error("Je mag voor deze deal geen offerte versturen.");

    const approvalResult = await client.query<DealApprovalRow>(
      `select *
       from public.deal_approvals
       where id = $1 and deal_id = $2
       for update`,
      [approvalId, dealId],
    );
    const approval = approvalResult.rows[0];
    if (!approval || approval.status !== "open") {
      throw new Error("De akkoordlink is niet meer actief.");
    }
    if (approval.snapshot_hash !== snapshotHashFromDeal(deal)) {
      throw new Error("De deal is na het maken van de akkoordlink gewijzigd.");
    }

    const updatedResult = await client.query<DealApprovalRow>(
      `update public.deal_approvals
       set drafted_at = coalesce(drafted_at, now()),
           updated_at = now()
       where id = $1
       returning *`,
      [approval.id],
    );
    const updated = updatedResult.rows[0];

    await client.query(
      `update public.deals
       set approval_requested_at = $2,
           approval_expires_at = $3,
           accepted_at = null,
           accepted_by_name = null,
           accepted_by_email = null
       where id = $1`,
      [dealId, updated.drafted_at, updated.expires_at],
    );

    return updated;
  });

  return toSummary(request, result);
}

export async function getPublicDealApproval(
  approvalId: string,
  tokenVersion: number,
  token: string,
) {
  if (!verifyDealApprovalToken(approvalId, tokenVersion, token)) {
    return { error: "Deze akkoordlink is ongeldig." } as const;
  }

  const { rows } = await query<DealApprovalRow & DealRow>(
    `select da.*, d.user_id, d.customer_name, d.quote_title, d.contact_name,
            d.package_name, d.total_users, d.monthly_total, d.implementation_total,
            d.sales_name, d.modules, d.calculator_inputs
     from public.deal_approvals da
     join public.deals d on d.id = da.deal_id
     where da.id = $1 and da.token_version = $2
     limit 1`,
    [approvalId, tokenVersion],
  );
  const row = rows[0];
  if (!row || row.status === "revoked") {
    return { error: "Deze akkoordlink is niet meer beschikbaar." } as const;
  }

  if (row.status === "open") {
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return { error: "Deze akkoordlink is verlopen. Vraag uw contactpersoon om een nieuwe link." } as const;
    }
    if (row.snapshot_hash !== snapshotHashFromDeal(row)) {
      return {
        error: "De offerte is inmiddels gewijzigd. Vraag uw contactpersoon om een nieuwe akkoordlink.",
      } as const;
    }
  }

  return { approval: toPublicSummary(row) } as const;
}

function requestIpAddress(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    ""
  ).slice(0, 100);
}

export async function acceptPublicDealApproval(
  request: Request,
  approvalId: string,
  tokenVersion: number,
  input: { name: string; email: string },
) {
  const name = asText(input.name, 200);
  const email = input.email.trim().toLowerCase().slice(0, 320);

  const result = await withTransaction(async (client) => {
    const approvalResult = await client.query<DealApprovalRow>(
      `select *
       from public.deal_approvals
       where id = $1 and token_version = $2
       for update`,
      [approvalId, tokenVersion],
    );
    const approval = approvalResult.rows[0];
    if (!approval || approval.status === "revoked") {
      throw new Error("Deze akkoordlink is niet meer beschikbaar.");
    }
    if (approval.status === "accepted") return approval;
    if (new Date(approval.expires_at).getTime() <= Date.now()) {
      throw new Error("Deze akkoordlink is verlopen.");
    }

    const dealResult = await client.query<DealRow>(
      `select id, user_id, customer_name, quote_title, contact_name, package_name,
              total_users, monthly_total, implementation_total, sales_name,
              modules, calculator_inputs
       from public.deals
       where id = $1
       for update`,
      [approval.deal_id],
    );
    const deal = dealResult.rows[0];
    if (!deal || approval.snapshot_hash !== snapshotHashFromDeal(deal)) {
      throw new Error("De offerte is inmiddels gewijzigd. Vraag om een nieuwe akkoordlink.");
    }

    const updatedResult = await client.query<DealApprovalRow>(
      `update public.deal_approvals
       set status = 'accepted',
           accepted_at = now(),
           accepted_by_name = $2,
           accepted_by_email = $3,
           accepted_ip = $4,
           accepted_user_agent = $5,
           updated_at = now()
       where id = $1
       returning *`,
      [
        approval.id,
        name,
        email,
        requestIpAddress(request),
        (request.headers.get("user-agent") || "").trim().slice(0, 500),
      ],
    );
    const updated = updatedResult.rows[0];

    await client.query(
      `update public.deals
       set accepted_at = $2,
           accepted_by_name = $3,
           accepted_by_email = $4,
           approval_expires_at = $5
       where id = $1`,
      [
        approval.deal_id,
        updated.accepted_at,
        updated.accepted_by_name,
        updated.accepted_by_email,
        updated.expires_at,
      ],
    );

    return updated;
  });

  return toPublicSummary(result);
}

export async function getDealApprovalForActor(
  request: Request,
  dealId: string,
  actor: Actor,
) {
  const deal = await getDeal(dealId);
  if (!deal) return { error: "Deal niet gevonden." } as const;
  if (!canManageDeal(actor, deal)) return { error: "Je hebt geen toegang tot deze deal." } as const;

  const { rows } = await query<DealApprovalRow>(
    `select * from public.deal_approvals where deal_id = $1 limit 1`,
    [dealId],
  );
  const approval = rows[0] ?? null;
  if (!approval) return { approval: null } as const;

  if (approval.status !== "revoked" && approval.snapshot_hash !== snapshotHashFromDeal(deal)) {
    const result = await withTransaction(async (client) => {
      const { rows: updatedRows } = await client.query<DealApprovalRow>(
        `update public.deal_approvals
         set status = 'revoked',
             token_version = token_version + 1,
             updated_at = now()
         where id = $1
         returning *`,
        [approval.id],
      );
      await client.query(
        `update public.deals
         set approval_requested_at = null,
             approval_expires_at = null,
             accepted_at = null,
             accepted_by_name = null,
             accepted_by_email = null
         where id = $1`,
        [dealId],
      );
      return updatedRows[0];
    });
    return { approval: toSummary(request, result) } as const;
  }

  return { approval: toSummary(request, approval) } as const;
}
