import { createHmac, timingSafeEqual } from "node:crypto";
import { canReadAllDeals, isLocalAdmin, type LocalUser } from "@/lib/local-auth";
import { createId, query } from "@/lib/local-db";
import {
  EMPTY_CUSTOMER_INTAKE_DATA,
  normalizeCustomerIntakeData,
  type CustomerIntakeData,
  type CustomerIntakeStatus,
  type CustomerIntakeSummary,
} from "@/lib/customer-intake";
import type { ProfileRecord } from "@/lib/supabase";

const CUSTOMER_INTAKE_TTL_DAYS = 30;

type Actor = {
  user: LocalUser;
  profile: ProfileRecord;
};

type DealRow = {
  id: string;
  user_id: string;
  customer_name: string | null;
  contact_name: string | null;
  calculator_inputs: Record<string, unknown> | null;
};

type CustomerIntakeRow = {
  id: string;
  deal_id: string;
  created_by: string;
  status: CustomerIntakeStatus;
  token_version: number;
  recipient_email: string | null;
  form_data: unknown;
  expires_at: string;
  submitted_at: string | null;
  processed_at: string | null;
  processed_by: string | null;
  created_at: string;
  updated_at: string;
};

function signingKey() {
  const key = (
    process.env.SALES_CUSTOMER_FORM_SIGNING_KEY ||
    process.env.SALES_2FA_ENCRYPTION_KEY ||
    ""
  ).trim();

  if (!key) {
    throw new Error(
      "Klantformulier-sleutel ontbreekt. Voeg SALES_CUSTOMER_FORM_SIGNING_KEY toe aan .env.local.",
    );
  }

  return key;
}

function signaturePayload(id: string, tokenVersion: number) {
  return `smart-trade-customer-intake:${id}:${tokenVersion}`;
}

function signCustomerIntake(id: string, tokenVersion: number) {
  return createHmac("sha256", signingKey())
    .update(signaturePayload(id, tokenVersion))
    .digest("base64url");
}

export function verifyCustomerIntakeToken(id: string, tokenVersion: number, token: string) {
  if (!token || !Number.isInteger(tokenVersion) || tokenVersion < 1) return false;

  const expected = Buffer.from(signCustomerIntake(id, tokenVersion));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function normalizeOrigin(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const url = new URL(request.url);
  const protocol = forwardedProto || url.protocol.replace(":", "") || "https";
  const host = forwardedHost || request.headers.get("host") || url.host;
  return `${protocol}://${host}`;
}

export function getCustomerIntakePublicUrl(request: Request, row: Pick<CustomerIntakeRow, "id" | "token_version">) {
  const url = new URL(`/klantgegevens/${row.id}`, normalizeOrigin(request));
  url.searchParams.set("v", String(row.token_version));
  url.searchParams.set("token", signCustomerIntake(row.id, row.token_version));
  return url.toString();
}

function toSummary(request: Request, row: CustomerIntakeRow): CustomerIntakeSummary {
  return {
    id: row.id,
    dealId: row.deal_id,
    status: row.status,
    recipientEmail: row.recipient_email ?? "",
    formData: normalizeCustomerIntakeData(row.form_data),
    publicUrl: getCustomerIntakePublicUrl(request, row),
    expiresAt: row.expires_at,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function canAccessDeal(actor: Actor, deal: DealRow) {
  return (
    deal.user_id === actor.user.id ||
    canReadAllDeals(actor.profile.role) ||
    isLocalAdmin(actor.profile)
  );
}

function isCalculatorDeal(deal: DealRow) {
  return deal.calculator_inputs?.quoteLayout !== "assets-expansion";
}

async function getDeal(dealId: string) {
  const { rows } = await query<DealRow>(
    `select id, user_id, customer_name, contact_name, calculator_inputs
     from public.deals
     where id = $1
     limit 1`,
    [dealId],
  );
  return rows[0] ?? null;
}

export async function requireAccessibleCalculatorDeal(dealId: string, actor: Actor) {
  const deal = await getDeal(dealId);
  if (!deal) return { ok: false, error: "Deal niet gevonden." } as const;
  if (!canAccessDeal(actor, deal)) {
    return { ok: false, error: "Je hebt geen toegang tot deze deal." } as const;
  }
  if (!isCalculatorDeal(deal)) {
    return {
      ok: false,
      error: "Een klantgegevensformulier is alleen beschikbaar voor calculator-deals.",
    } as const;
  }
  return { ok: true, deal } as const;
}

export async function getCustomerIntakeForDeal(request: Request, dealId: string, actor: Actor) {
  const access = await requireAccessibleCalculatorDeal(dealId, actor);
  if (!access.ok) return access;

  const { rows } = await query<CustomerIntakeRow>(
    `select *
     from public.customer_intakes
     where deal_id = $1
     limit 1`,
    [dealId],
  );

  return {
    deal: access.deal,
    intake: rows[0] ? toSummary(request, rows[0]) : null,
  } as const;
}

export async function createOrRefreshCustomerIntake(
  request: Request,
  dealId: string,
  actor: Actor,
  input: { recipientEmail?: string; regenerate?: boolean },
) {
  const access = await requireAccessibleCalculatorDeal(dealId, actor);
  if (!access.ok) return access;

  const recipientEmail = typeof input.recipientEmail === "string"
    ? input.recipientEmail.trim().toLowerCase().slice(0, 180)
    : "";
  const initialFormData: CustomerIntakeData = {
    ...EMPTY_CUSTOMER_INTAKE_DATA,
    deliveryName: access.deal.customer_name?.trim() ?? "",
    contactName: access.deal.contact_name?.trim() ?? "",
    contactEmail: recipientEmail,
  };
  const id = createId();

  const { rows } = await query<CustomerIntakeRow>(
    `insert into public.customer_intakes
      (id, deal_id, created_by, recipient_email, form_data, expires_at)
     values ($1, $2, $3, $4, $5::jsonb, now() + ($6 * interval '1 day'))
     on conflict (deal_id) do update
       set recipient_email = case
             when $4 = '' then public.customer_intakes.recipient_email
             else $4
           end,
           token_version = case
             when $7 then public.customer_intakes.token_version + 1
             else public.customer_intakes.token_version
           end,
           status = case
             when $7 then 'open'
             else public.customer_intakes.status
           end,
           submitted_at = case
             when $7 then null
             else public.customer_intakes.submitted_at
           end,
           expires_at = case
             when $7 or public.customer_intakes.expires_at <= now()
               then now() + ($6 * interval '1 day')
             else public.customer_intakes.expires_at
           end,
           updated_at = now()
     returning *`,
    [
      id,
      dealId,
      actor.user.id,
      recipientEmail,
      JSON.stringify(initialFormData),
      CUSTOMER_INTAKE_TTL_DAYS,
      Boolean(input.regenerate),
    ],
  );

  return {
    deal: access.deal,
    intake: toSummary(request, rows[0]),
  } as const;
}

export async function getPublicCustomerIntake(
  request: Request,
  id: string,
  tokenVersion: number,
  token: string,
) {
  const { rows } = await query<CustomerIntakeRow & { customer_name: string | null }>(
    `select ci.*, d.customer_name
     from public.customer_intakes ci
     join public.deals d on d.id = ci.deal_id
     where ci.id = $1
     limit 1`,
    [id],
  );
  const row = rows[0] ?? null;

  if (!row || row.token_version !== tokenVersion || !verifyCustomerIntakeToken(id, tokenVersion, token)) {
    return { error: "Deze klantlink is ongeldig." } as const;
  }
  if (row.status === "revoked") return { error: "Deze klantlink is ingetrokken." } as const;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { error: "Deze klantlink is verlopen. Vraag uw contactpersoon om een nieuwe link." } as const;
  }

  return {
    intake: {
      id: row.id,
      status: row.status,
      formData: normalizeCustomerIntakeData(row.form_data),
      expiresAt: row.expires_at,
      submittedAt: row.submitted_at,
      customerName: row.customer_name ?? "",
    },
  } as const;
}

export async function submitPublicCustomerIntake(id: string, formData: CustomerIntakeData) {
  const { rows } = await query<CustomerIntakeRow>(
    `update public.customer_intakes
     set form_data = $2::jsonb,
         recipient_email = coalesce(nullif($3, ''), recipient_email),
         status = 'submitted',
         submitted_at = now(),
         updated_at = now()
     where id = $1
       and status <> 'revoked'
       and expires_at > now()
     returning *`,
    [id, JSON.stringify(formData), formData.contactEmail || formData.generalEmail],
  );

  return rows[0] ?? null;
}
