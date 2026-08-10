import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createId, query, withTransaction } from "@/lib/local-db";
import { normalizeWorldlineAgreementFields } from "@/lib/worldline";
import {
  EMPTY_WORLDLINE_RETURN_PIN_FORM_DATA,
  WORLDLINE_RETURN_PIN_ACCEPTANCE_TEXT,
  WORLDLINE_RETURN_PIN_ACCEPTANCE_VERSION,
  normalizeWorldlineReturnPinFormData,
  validateWorldlineReturnPinFormData,
  type PublicWorldlineReturnPinForm,
  type WorldlineReturnPinEvidence,
  type WorldlineReturnPinFormData,
  type WorldlineReturnPinFormSummary,
  type WorldlineReturnPinStatus,
} from "@/lib/worldline-return-pin";

const RETURN_PIN_FORM_TTL_DAYS = 30;
const ENCRYPTION_PREFIX = "v1";

type WorldlineProjectRow = {
  id: string;
  relation_name: string;
  relation_email: string | null;
  agreement_fields: unknown;
};

type WorldlineReturnPinRow = {
  id: string;
  project_id: string;
  version: number;
  status: WorldlineReturnPinStatus;
  token_version: number;
  form_data: unknown;
  acceptance_version: string;
  expires_at: Date | string;
  accepted_at: Date | string | null;
  accepted_by_name: string | null;
  accepted_by_function: string | null;
  accepted_place: string | null;
  accepted_ip: string | null;
  accepted_user_agent: string | null;
  evidence_hash: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function secretMaterial() {
  const key = (
    process.env.SALES_CUSTOMER_FORM_SIGNING_KEY ||
    process.env.SALES_2FA_ENCRYPTION_KEY ||
    process.env.LOCAL_AUTH_SECRET ||
    ""
  ).trim();

  if (!key) {
    throw new Error(
      "Klantformulier-sleutel ontbreekt. Voeg SALES_CUSTOMER_FORM_SIGNING_KEY toe aan .env.local.",
    );
  }
  return key;
}

function encryptionKey() {
  return createHash("sha256").update(`worldline-return-pin:${secretMaterial()}`).digest();
}

function encryptPinCode(pinCode: string) {
  if (!pinCode || pinCode.startsWith(`${ENCRYPTION_PREFIX}:`)) return pinCode;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(pinCode, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTION_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

function decryptPinCode(value: string) {
  if (!value.startsWith(`${ENCRYPTION_PREFIX}:`)) return value;
  const [, ivText, tagText, encryptedText] = value.split(":");
  if (!ivText || !tagText || !encryptedText) return "";

  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

function encryptFormData(formData: WorldlineReturnPinFormData) {
  return {
    ...formData,
    authorizedUsers: formData.authorizedUsers.map((user) => ({
      ...user,
      pinCode: encryptPinCode(user.pinCode),
    })),
  };
}

function decryptFormData(value: unknown) {
  const formData = normalizeWorldlineReturnPinFormData(value);
  return {
    ...formData,
    authorizedUsers: formData.authorizedUsers.map((user) => ({
      ...user,
      pinCode: decryptPinCode(user.pinCode),
    })),
  };
}

function signaturePayload(id: string, tokenVersion: number) {
  return `smart-trade-worldline-return-pin:${id}:${tokenVersion}`;
}

function signReturnPinForm(id: string, tokenVersion: number) {
  return createHmac("sha256", secretMaterial())
    .update(signaturePayload(id, tokenVersion))
    .digest("base64url");
}

export function verifyReturnPinFormToken(id: string, tokenVersion: number, token: string) {
  if (!token || !Number.isInteger(tokenVersion) || tokenVersion < 1) return false;
  const expected = Buffer.from(signReturnPinForm(id, tokenVersion));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function requestOrigin(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const url = new URL(request.url);
  const host = forwardedHost || request.headers.get("host") || url.host;
  const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const protocol = process.env.NODE_ENV === "production" && !isLocalHost
    ? "https"
    : forwardedProto || url.protocol.replace(":", "") || "https";
  return `${protocol}://${host}`;
}

function publicUrl(request: Request, row: Pick<WorldlineReturnPinRow, "id" | "token_version">) {
  const url = new URL(`/retourpinnen/${row.id}`, requestOrigin(request));
  url.searchParams.set("v", String(row.token_version));
  url.searchParams.set("token", signReturnPinForm(row.id, row.token_version));
  return url.toString();
}

function isoString(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function evidenceFromRow(row: WorldlineReturnPinRow): WorldlineReturnPinEvidence | null {
  const acceptedAt = isoString(row.accepted_at);
  if (!acceptedAt || !row.evidence_hash) return null;
  return {
    acceptedAt,
    acceptedByName: row.accepted_by_name ?? "",
    acceptedByFunction: row.accepted_by_function ?? "",
    acceptedPlace: row.accepted_place ?? "",
    ipAddress: row.accepted_ip ?? "",
    userAgent: row.accepted_user_agent ?? "",
    acceptanceVersion: row.acceptance_version,
    evidenceHash: row.evidence_hash,
  };
}

function toInternalSummary(request: Request, row: WorldlineReturnPinRow): WorldlineReturnPinFormSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    version: row.version,
    status: row.status,
    formData: decryptFormData(row.form_data),
    publicUrl: publicUrl(request, row),
    expiresAt: isoString(row.expires_at) ?? "",
    acceptedAt: isoString(row.accepted_at),
    evidence: evidenceFromRow(row),
    createdAt: isoString(row.created_at) ?? "",
    updatedAt: isoString(row.updated_at) ?? "",
  };
}

function toPublicSummary(
  row: WorldlineReturnPinRow,
  customerName: string,
): PublicWorldlineReturnPinForm {
  const formData = decryptFormData(row.form_data);
  if (row.status === "accepted") {
    formData.authorizedUsers = formData.authorizedUsers.map((user) => ({ ...user, pinCode: "" }));
  }

  return {
    id: row.id,
    version: row.version,
    status: row.status,
    formData,
    customerName,
    expiresAt: isoString(row.expires_at) ?? "",
    acceptedAt: isoString(row.accepted_at),
    createdAt: isoString(row.created_at) ?? "",
    updatedAt: isoString(row.updated_at) ?? "",
  };
}

function initialFormData(project: WorldlineProjectRow): WorldlineReturnPinFormData {
  const agreement = normalizeWorldlineAgreementFields(project.agreement_fields);
  return {
    ...EMPTY_WORLDLINE_RETURN_PIN_FORM_DATA,
    companyName: agreement.companyName || project.relation_name,
    email: agreement.companyEmail || project.relation_email || "",
    phone: agreement.mobileNumber || agreement.phoneNumber || "",
    notificationEmail: agreement.companyEmail || project.relation_email || "",
    acceptancePlace: agreement.businessCity || "",
    acceptedByName: agreement.signers || agreement.contactPerson || "",
    acceptedByFunction: agreement.signerFunction || "",
    authorizedUsers: [{ id: createId(), name: "", pinCode: "" }],
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

function evidenceHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue(value)))
    .digest("hex");
}

function requestIpAddress(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    ""
  ).slice(0, 100);
}

export async function getWorldlineReturnPinForms(
  request: Request,
  projectId: string,
  includePinCodes = false,
) {
  const { rows: projectRows } = await query<WorldlineProjectRow>(
    `select id, relation_name, relation_email, agreement_fields
     from public.worldline_projects
     where id = $1
     limit 1`,
    [projectId],
  );
  const project = projectRows[0] ?? null;
  if (!project) return { error: "Worldline-project niet gevonden." } as const;

  const { rows } = await query<WorldlineReturnPinRow>(
    `select *
     from public.worldline_return_pin_forms
     where project_id = $1
     order by version desc
     limit 20`,
    [projectId],
  );

  return {
    project,
    forms: rows.map((row) => {
      const summary = toInternalSummary(request, row);
      if (!includePinCodes) {
        summary.formData.authorizedUsers = summary.formData.authorizedUsers.map((user) => ({
          ...user,
          pinCode: "",
        }));
      }
      return summary;
    }),
  } as const;
}

export async function createWorldlineReturnPinForm(
  request: Request,
  projectId: string,
  createdBy: string,
  forceNew: boolean,
) {
  const result = await withTransaction(async (client) => {
    const projectResult = await client.query<WorldlineProjectRow>(
      `select id, relation_name, relation_email, agreement_fields
       from public.worldline_projects
       where id = $1
       for update`,
      [projectId],
    );
    const project = projectResult.rows[0] ?? null;
    if (!project) throw new Error("Worldline-project niet gevonden.");

    const currentResult = await client.query<WorldlineReturnPinRow>(
      `select *
       from public.worldline_return_pin_forms
       where project_id = $1
       order by version desc
       limit 1`,
      [projectId],
    );
    const current = currentResult.rows[0] ?? null;
    const currentExpired = current ? new Date(current.expires_at).getTime() <= Date.now() : false;
    if (current && !forceNew && !currentExpired && current.status !== "revoked") {
      return { project, row: current };
    }

    if (current?.status === "open") {
      await client.query(
        `update public.worldline_return_pin_forms
         set status = 'revoked', updated_at = now()
         where id = $1`,
        [current.id],
      );
    }

    const version = (current?.version ?? 0) + 1;
    const id = createId();
    const formData = initialFormData(project);
    const created = await client.query<WorldlineReturnPinRow>(
      `insert into public.worldline_return_pin_forms
        (id, project_id, version, created_by, form_data, acceptance_version, expires_at)
       values ($1, $2, $3, $4, $5::jsonb, $6, now() + ($7 * interval '1 day'))
       returning *`,
      [
        id,
        projectId,
        version,
        createdBy,
        JSON.stringify(encryptFormData(formData)),
        WORLDLINE_RETURN_PIN_ACCEPTANCE_VERSION,
        RETURN_PIN_FORM_TTL_DAYS,
      ],
    );
    return { project, row: created.rows[0] };
  });

  return {
    project: result.project,
    form: toInternalSummary(request, result.row),
  } as const;
}

export async function getPublicWorldlineReturnPinForm(
  id: string,
  tokenVersion: number,
  token: string,
) {
  const { rows } = await query<WorldlineReturnPinRow & { relation_name: string }>(
    `select form.*, project.relation_name
     from public.worldline_return_pin_forms form
     join public.worldline_projects project on project.id = form.project_id
     where form.id = $1
     limit 1`,
    [id],
  );
  const row = rows[0] ?? null;
  if (!row || row.token_version !== tokenVersion || !verifyReturnPinFormToken(id, tokenVersion, token)) {
    return { error: "Deze klantlink is ongeldig." } as const;
  }
  if (row.status === "revoked") return { error: "Deze klantlink is ingetrokken." } as const;
  if (row.status === "open" && new Date(row.expires_at).getTime() <= Date.now()) {
    return { error: "Deze klantlink is verlopen. Vraag uw contactpersoon om een nieuwe link." } as const;
  }

  return { form: toPublicSummary(row, row.relation_name) } as const;
}

export async function acceptPublicWorldlineReturnPinForm(
  request: Request,
  id: string,
  tokenVersion: number,
  token: string,
  rawFormData: unknown,
  confirmed: boolean,
) {
  return withTransaction(async (client) => {
    const result = await client.query<WorldlineReturnPinRow & { relation_name: string }>(
      `select form.*, project.relation_name
       from public.worldline_return_pin_forms form
       join public.worldline_projects project on project.id = form.project_id
       where form.id = $1
       for update`,
      [id],
    );
    const row = result.rows[0] ?? null;
    if (!row || row.token_version !== tokenVersion || !verifyReturnPinFormToken(id, tokenVersion, token)) {
      return { error: "Deze klantlink is ongeldig." } as const;
    }
    if (row.status === "revoked") return { error: "Deze klantlink is ingetrokken." } as const;
    if (row.status === "accepted") {
      return { form: toPublicSummary(row, row.relation_name) } as const;
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return { error: "Deze klantlink is verlopen. Vraag uw contactpersoon om een nieuwe link." } as const;
    }

    const formData = normalizeWorldlineReturnPinFormData(rawFormData);
    const validationError = validateWorldlineReturnPinFormData(formData);
    if (validationError) return { error: validationError } as const;
    if (!confirmed) return { error: "Bevestig dat u akkoord gaat met de verklaring." } as const;

    const acceptedAt = new Date().toISOString();
    const ipAddress = requestIpAddress(request);
    const userAgent = (request.headers.get("user-agent") || "").trim().slice(0, 500);
    const hash = evidenceHash({
      formId: row.id,
      projectId: row.project_id,
      version: row.version,
      formData,
      acceptanceText: WORLDLINE_RETURN_PIN_ACCEPTANCE_TEXT,
      acceptanceVersion: WORLDLINE_RETURN_PIN_ACCEPTANCE_VERSION,
      acceptedAt,
      ipAddress,
      userAgent,
    });

    const updatedResult = await client.query<WorldlineReturnPinRow & { relation_name: string }>(
      `update public.worldline_return_pin_forms
       set form_data = $2::jsonb,
           status = 'accepted',
           acceptance_version = $3,
           accepted_at = $4,
           accepted_by_name = $5,
           accepted_by_function = $6,
           accepted_place = $7,
           accepted_ip = $8,
           accepted_user_agent = $9,
           evidence_hash = $10,
           updated_at = now()
       where id = $1
       returning *, $11::text as relation_name`,
      [
        id,
        JSON.stringify(encryptFormData(formData)),
        WORLDLINE_RETURN_PIN_ACCEPTANCE_VERSION,
        acceptedAt,
        formData.acceptedByName,
        formData.acceptedByFunction,
        formData.acceptancePlace,
        ipAddress,
        userAgent,
        hash,
        row.relation_name,
      ],
    );
    const updated = updatedResult.rows[0];
    return { form: toPublicSummary(updated, row.relation_name) } as const;
  });
}
