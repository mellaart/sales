import { createHmac, timingSafeEqual } from "node:crypto";
import { canReadAllDeals, isLocalAdmin, type LocalUser } from "@/lib/local-auth";
import { createId, query, withTransaction } from "@/lib/local-db";
import {
  DEFAULT_DIRECT_DEBIT_CREDITOR_NAME,
  DIRECT_DEBIT_CONSENT_VERSION,
  EMPTY_CUSTOMER_INTAKE_DATA,
  directDebitConsentText,
  normalizeCustomerIntakeData,
  splitCustomerContactName,
  type CustomerDirectDebitMandateDetails,
  type CustomerDirectDebitMandateEvidence,
  type CustomerIntakeData,
  type CustomerIntakeStatus,
  type CustomerIntakeSummary,
} from "@/lib/customer-intake";
import {
  createLiveSmartTradeRelation,
  formatSmartTradeMandateReference,
} from "@/lib/smart-trade-relations";
import type { ProfileRecord } from "@/lib/supabase";

const CUSTOMER_INTAKE_TTL_DAYS = 30;

type Actor = {
  user: LocalUser;
  profile: ProfileRecord;
};

type DealRow = {
  id: string;
  user_id: string;
  smart_trade_relation_id: number | null;
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
  direct_debit_mandate: unknown;
  expires_at: string;
  submitted_at: string | null;
  processed_at: string | null;
  processed_by: string | null;
  notification_sent_at: string | null;
  notification_error: string | null;
  created_at: string;
  updated_at: string;
};

function directDebitCreditorName() {
  return (
    process.env.SALES_SEPA_CREDITOR_NAME || DEFAULT_DIRECT_DEBIT_CREDITOR_NAME
  ).trim().slice(0, 180) || DEFAULT_DIRECT_DEBIT_CREDITOR_NAME;
}

function directDebitCreditorIdentifier() {
  return (process.env.SALES_SEPA_CREDITOR_ID || "").trim().toUpperCase().slice(0, 35);
}

function legacyDirectDebitMandateReference(intakeId: string) {
  return `ST${intakeId.replace(/[^a-f0-9]/gi, "").toUpperCase()}`.slice(0, 35);
}

function directDebitMandateDetails(
  intakeId: string,
  smartTradeRelationId: number | null,
): CustomerDirectDebitMandateDetails {
  const creditorName = directDebitCreditorName();
  return {
    mandateReference: smartTradeRelationId
      ? formatSmartTradeMandateReference(smartTradeRelationId)
      : legacyDirectDebitMandateReference(intakeId),
    creditorName,
    creditorIdentifier: directDebitCreditorIdentifier(),
    consentText: directDebitConsentText(creditorName),
    consentVersion: DIRECT_DEBIT_CONSENT_VERSION,
  };
}

function textProperty(source: Record<string, unknown>, key: string, maxLength: number) {
  return typeof source[key] === "string" ? source[key].trim().slice(0, maxLength) : "";
}

function normalizeDirectDebitMandateEvidence(value: unknown): CustomerDirectDebitMandateEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const evidence: CustomerDirectDebitMandateEvidence = {
    mandateReference: textProperty(source, "mandateReference", 35),
    creditorName: textProperty(source, "creditorName", 180),
    creditorIdentifier: textProperty(source, "creditorIdentifier", 35),
    accountHolder: textProperty(source, "accountHolder", 180),
    iban: textProperty(source, "iban", 60),
    consentText: textProperty(source, "consentText", 2_000),
    consentVersion: textProperty(source, "consentVersion", 80),
    acceptedAt: textProperty(source, "acceptedAt", 80),
    ipAddress: textProperty(source, "ipAddress", 100),
    userAgent: textProperty(source, "userAgent", 500),
  };
  return evidence.mandateReference && evidence.acceptedAt ? evidence : null;
}

function requestIpAddress(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    ""
  ).slice(0, 100);
}

function createDirectDebitMandateEvidence(
  request: Request,
  formData: CustomerIntakeData,
  mandateDetails: CustomerDirectDebitMandateDetails,
): CustomerDirectDebitMandateEvidence | null {
  if (formData.directDebit !== "yes" || formData.directDebitConsent !== "accepted") return null;
  return {
    ...mandateDetails,
    accountHolder: formData.directDebitAccountHolder,
    iban: formData.directDebitBankAccount,
    acceptedAt: new Date().toISOString(),
    ipAddress: requestIpAddress(request),
    userAgent: (request.headers.get("user-agent") || "").trim().slice(0, 500),
  };
}

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
  const host = forwardedHost || request.headers.get("host") || url.host;
  const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const protocol =
    process.env.NODE_ENV === "production" && !isLocalHost
      ? "https"
      : forwardedProto || url.protocol.replace(":", "") || "https";
  return `${protocol}://${host}`;
}

export function getCustomerIntakePublicUrl(request: Request, row: Pick<CustomerIntakeRow, "id" | "token_version">) {
  const url = new URL(`/klantgegevens/${row.id}`, normalizeOrigin(request));
  url.searchParams.set("v", String(row.token_version));
  url.searchParams.set("token", signCustomerIntake(row.id, row.token_version));
  return url.toString();
}

function toSummary(
  request: Request,
  row: CustomerIntakeRow,
  smartTradeRelationId: number | null,
): CustomerIntakeSummary {
  return {
    id: row.id,
    dealId: row.deal_id,
    smartTradeRelationId,
    status: row.status,
    recipientEmail: row.recipient_email ?? "",
    formData: normalizeCustomerIntakeData(row.form_data),
    directDebitMandate: normalizeDirectDebitMandateEvidence(row.direct_debit_mandate),
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
    `select id, user_id, smart_trade_relation_id, customer_name, contact_name, calculator_inputs
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
      error: "Een klantformulier is alleen beschikbaar voor calculator-deals.",
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
    intake: rows[0]
      ? toSummary(request, rows[0], access.deal.smart_trade_relation_id)
      : null,
  } as const;
}

export async function createOrRefreshCustomerIntake(
  request: Request,
  dealId: string,
  actor: Actor,
  input: {
    recipientEmail?: string;
    regenerate?: boolean;
    smartTradeRelationId?: number | null;
  },
) {
  const access = await requireAccessibleCalculatorDeal(dealId, actor);
  if (!access.ok) return access;

  const recipientEmail = typeof input.recipientEmail === "string"
    ? input.recipientEmail.trim().toLowerCase().slice(0, 180)
    : "";
  const contactName = access.deal.contact_name?.trim() ?? "";
  const contact = splitCustomerContactName(contactName);
  const initialFormData: CustomerIntakeData = {
    ...EMPTY_CUSTOMER_INTAKE_DATA,
    deliveryName: access.deal.customer_name?.trim() ?? "",
    contactFirstName: contact.firstName,
    contactLastName: contact.lastName,
    contactName,
    contactEmail: recipientEmail,
  };
  const id = createId();

  const result = await withTransaction(async (client) => {
    const lockedDealResult = await client.query<DealRow>(
      `select id, user_id, smart_trade_relation_id, customer_name, contact_name, calculator_inputs
       from public.deals
       where id = $1
       for update`,
      [dealId],
    );
    const lockedDeal = lockedDealResult.rows[0];
    if (!lockedDeal) throw new Error("Deal niet gevonden.");
    if (!canAccessDeal(actor, lockedDeal)) {
      throw new Error("Je hebt geen toegang tot deze deal.");
    }

    const existingIntakeResult = await client.query(
      `select 1
       from public.customer_intakes
       where deal_id = $1
       limit 1`,
      [dealId],
    );
    const isNewIntake = existingIntakeResult.rowCount === 0;

    const intakeResult = await client.query<CustomerIntakeRow>(
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

    let relationId = input.smartTradeRelationId ?? lockedDeal.smart_trade_relation_id;
    if (!relationId && isNewIntake) {
      const createdRelation = await createLiveSmartTradeRelation(lockedDeal.customer_name ?? "");
      relationId = createdRelation.relationId;
    }
    if (relationId && relationId !== lockedDeal.smart_trade_relation_id) {
      await client.query(
        `update public.deals
         set smart_trade_relation_id = $2,
             updated_at = now()
         where id = $1`,
        [dealId, relationId],
      );
    }

    return {
      deal: { ...lockedDeal, smart_trade_relation_id: relationId },
      intake: intakeResult.rows[0],
      relationId,
    };
  });

  return {
    deal: result.deal,
    intake: toSummary(request, result.intake, result.relationId),
  } as const;
}

export async function getPublicCustomerIntake(
  request: Request,
  id: string,
  tokenVersion: number,
  token: string,
) {
  const { rows } = await query<CustomerIntakeRow & {
    customer_name: string | null;
    smart_trade_relation_id: number | null;
  }>(
    `select ci.*, d.customer_name, d.smart_trade_relation_id
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

  const formData = normalizeCustomerIntakeData(row.form_data);
  const mandateDetails = directDebitMandateDetails(row.id, row.smart_trade_relation_id);
  const storedMandate = normalizeDirectDebitMandateEvidence(row.direct_debit_mandate);
  if (
    formData.directDebitConsent === "accepted" &&
    (
      !storedMandate ||
      storedMandate.consentVersion !== mandateDetails.consentVersion ||
      storedMandate.mandateReference !== mandateDetails.mandateReference ||
      storedMandate.creditorName !== mandateDetails.creditorName ||
      storedMandate.creditorIdentifier !== mandateDetails.creditorIdentifier
    )
  ) {
    formData.directDebitConsent = "";
  }

  return {
    intake: {
      id: row.id,
      status: row.status,
      formData,
      expiresAt: row.expires_at,
      submittedAt: row.submitted_at,
      customerName: row.customer_name ?? "",
      directDebitMandateDetails: mandateDetails,
    },
  } as const;
}

export async function submitPublicCustomerIntake(
  request: Request,
  id: string,
  formData: CustomerIntakeData,
  mandateDetails: CustomerDirectDebitMandateDetails,
) {
  const directDebitMandate = createDirectDebitMandateEvidence(
    request,
    formData,
    mandateDetails,
  );
  const { rows } = await query<CustomerIntakeRow>(
    `update public.customer_intakes
     set form_data = $2::jsonb,
         recipient_email = coalesce(nullif($3, ''), recipient_email),
         direct_debit_mandate = $4::jsonb,
         status = 'submitted',
         submitted_at = now(),
         notification_sent_at = null,
         notification_error = null,
         updated_at = now()
     where id = $1
       and status <> 'revoked'
       and expires_at > now()
     returning *`,
    [
      id,
      JSON.stringify(formData),
      formData.contactEmail || formData.generalEmail,
      directDebitMandate ? JSON.stringify(directDebitMandate) : null,
    ],
  );

  return rows[0] ?? null;
}

export async function recordCustomerIntakeNotification(
  id: string,
  errorMessage: string | null,
) {
  await query(
    `update public.customer_intakes
     set notification_sent_at = case when $2::text is null then now() else null end,
         notification_error = $2,
         updated_at = now()
     where id = $1`,
    [id, errorMessage],
  );
}
