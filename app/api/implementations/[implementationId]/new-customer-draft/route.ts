import { NextResponse } from "next/server";
import { normalizeCustomerIntakeData } from "@/lib/customer-intake";
import { requireLocalUser } from "@/lib/local-auth";
import { query } from "@/lib/local-db";
import { executeLocalTableQuery } from "@/lib/local-table";
import {
  buildNewCustomerEmail,
  getNewCustomerEmailMissingFields,
} from "@/lib/new-customer-email";
import {
  createOutlookDraft,
  getOutlookConnectUrl,
  OutlookReconnectRequiredError,
} from "@/lib/outlook-server";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { readLocalRoleTabAccess } from "@/lib/role-tab-access-storage";
import { canWriteTab } from "@/lib/role-tabs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECIPIENT_EMAIL = "martijn@troublefree.nl";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ImplementationRow = {
  id: string;
  deal_id: string;
  customer_name: string;
  assigned_consultant_name: string | null;
  administration_name: string | null;
  planned_go_live_date: string | null;
  financial_package: string | null;
  website_webshop: string | null;
};

type DealRow = {
  package_name: string | null;
  total_users: number | null;
  monthly_total: number | null;
  implementation_total: number | null;
  modules: unknown;
  calculator_inputs: unknown;
};

type CustomerIntakeRow = {
  status: string;
  submitted_at: string | null;
  form_data: unknown;
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ implementationId: string }> },
) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);

    const roleTabAccess = await readLocalRoleTabAccess();
    if (
      !isProtectedAdminEmail(verified.user.email) &&
      !canWriteTab(verified.profile.role, "implementation", roleTabAccess)
    ) {
      return jsonResponse({ error: "Je hebt geen schrijfrechten voor Implementatie." }, 403);
    }

    const { implementationId } = await context.params;
    const access = await executeLocalTableQuery({
      table: "implementations",
      action: "select",
      select: [
        "id",
        "deal_id",
        "customer_name",
        "assigned_consultant_name",
        "administration_name",
        "planned_go_live_date",
        "financial_package",
        "website_webshop",
      ].join(","),
      filters: [{ column: "id", op: "eq", value: implementationId }],
      maybeSingle: true,
    }, {
      user: verified.user,
      profile: verified.profile,
    });
    const implementation = access.data as ImplementationRow | null;
    if (!implementation) {
      return jsonResponse({ error: "Implementatie niet gevonden of niet toegankelijk." }, 404);
    }

    const [{ rows: dealRows }, { rows: intakeRows }, { rows: profileRows }] = await Promise.all([
      query<DealRow>(
        `select package_name, total_users, monthly_total, implementation_total,
                modules, calculator_inputs
         from public.deals
         where id = $1
         limit 1`,
        [implementation.deal_id],
      ),
      query<CustomerIntakeRow>(
        `select status, submitted_at, form_data
         from public.customer_intakes
         where deal_id = $1
         limit 1`,
        [implementation.deal_id],
      ),
      query<{ email: string | null }>(
        `select email
         from public.profiles
         where email is not null
           and btrim(email) <> ''
         order by lower(email)`,
      ),
    ]);
    const deal = dealRows[0];
    const intakeRow = intakeRows[0];

    if (!deal) return jsonResponse({ error: "De calculator-deal ontbreekt." }, 404);
    if (!intakeRow) return jsonResponse({ error: "Het klantformulier ontbreekt." }, 409);

    const intakeSubmitted = Boolean(
      intakeRow.submitted_at && ["submitted", "processed"].includes(intakeRow.status),
    );
    const missingFields = getNewCustomerEmailMissingFields({
      implementation,
      intakeSubmitted,
    });
    if (missingFields.length > 0) {
      return jsonResponse({
        error: `Vul eerst de volgende gegevens in: ${missingFields.join(", ")}.`,
        missingFields,
      }, 409);
    }

    const intake = normalizeCustomerIntakeData(intakeRow.form_data);
    const { subject, htmlBody } = buildNewCustomerEmail({ implementation, deal, intake });
    const senderEmail = normalizeEmail(verified.profile.email || verified.user.email);
    const ccRecipientEmails = Array.from(new Set(
      profileRows
        .map((profile) => normalizeEmail(profile.email))
        .filter((email) => (
          EMAIL_PATTERN.test(email) &&
          email !== RECIPIENT_EMAIL &&
          email !== senderEmail
        )),
    ));
    const signature = {
      fullName:
        verified.profile.full_name?.trim() ||
        verified.user.user_metadata.full_name?.trim() ||
        "Smart Trade",
      jobTitle: verified.profile.job_title?.trim() || "",
      workdays: verified.profile.workdays?.trim() || "",
      mobilePhone: verified.profile.mobile_phone?.trim() || "",
      email: verified.profile.email?.trim() || verified.user.email?.trim() || "",
    };

    const webLink = await createOutlookDraft(request, verified.user.id, {
      recipientEmail: RECIPIENT_EMAIL,
      ccRecipientEmails,
      subject,
      htmlBody,
      signature,
    });

    return jsonResponse({ webLink, recipientEmail: RECIPIENT_EMAIL, ccRecipientEmails }, 201);
  } catch (error) {
    if (error instanceof OutlookReconnectRequiredError) {
      return jsonResponse({
        error: error.message,
        reconnectRequired: true,
        connectUrl: getOutlookConnectUrl(
          request,
          new URL(request.url).searchParams.get("returnTo"),
        ),
      }, 409);
    }

    return jsonResponse({
      error: error instanceof Error ? error.message : "Nieuwe klantmail maken mislukt.",
    }, 500);
  }
}
