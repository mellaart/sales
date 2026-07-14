import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import {
  fetchWithSmartTradeTimeout,
  getSmartTradePullConfig,
  getSmartTradePullHeaders,
} from "@/lib/smart-trade-pull-test";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CreateContactPersonBody = {
  gender?: unknown;
  firstName?: unknown;
  lastNamePrefix?: unknown;
  lastName?: unknown;
  phone?: unknown;
  phoneMobile?: unknown;
  phoneWork?: unknown;
  email?: unknown;
  position?: unknown;
};

function textValue(value: unknown, maxLength = 255) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function responseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function apiErrorMessage(status: number, body: unknown) {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const message = record.message ?? record.error;
    const errors = record.errors;
    if (errors && typeof errors === "object") {
      const details = Object.entries(errors as Record<string, unknown>)
        .flatMap(([field, value]) => (Array.isArray(value) ? value : [value])
          .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
          .map((item) => `${field}: ${item.trim()}`))
        .join(" ");
      if (details) return details;
    }
    if (typeof message === "string" && message.trim()) return message.trim();
  }

  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 700);
  return `Smart Trade API gaf status ${status}.`;
}

function contactPersonIdFromResponse(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const data = record.data && typeof record.data === "object"
    ? record.data as Record<string, unknown>
    : record;
  const id = data.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ relationId: string }> },
) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message }, { status: 401 });
    }

    if (verified.profile.role !== "admin") {
      return NextResponse.json({ error: "Alleen een admin kan testcontactpersonen aanmaken." }, { status: 403 });
    }

    const { relationId: rawRelationId } = await context.params;
    const relationId = rawRelationId.trim();
    if (!/^\d+$/.test(relationId) || Number(relationId) < 1) {
      return NextResponse.json({ error: "Vul een geldig relatie-ID in." }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as CreateContactPersonBody | null;
    const gender = textValue(body?.gender, 1).toUpperCase();
    const payload = {
      gender: ["M", "V", "F"].includes(gender) ? gender : "",
      firstName: textValue(body?.firstName, 100),
      lastNamePrefix: textValue(body?.lastNamePrefix, 40),
      lastName: textValue(body?.lastName, 120),
      phone: textValue(body?.phone, 80),
      phoneMobile: textValue(body?.phoneMobile, 80),
      phoneWork: textValue(body?.phoneWork, 80),
      email: textValue(body?.email, 180).toLowerCase(),
      position: textValue(body?.position, 120),
    };

    if (!payload.firstName || !payload.lastName || !payload.email) {
      return NextResponse.json(
        { error: "Voornaam, achternaam en e-mailadres zijn verplicht." },
        { status: 400 },
      );
    }

    if (!/^\S+@\S+\.\S+$/.test(payload.email)) {
      return NextResponse.json({ error: "Vul een geldig e-mailadres in." }, { status: 400 });
    }

    const config = getSmartTradePullConfig("test");
    const targetUrl = new URL(`/api/v1/relations/${relationId}/contactpersons`, config.baseUrl).toString();
    const headers = getSmartTradePullHeaders("test", {
      "content-type": "application/json",
    });
    const response = await fetchWithSmartTradeTimeout(targetUrl, headers, "test", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const apiBody = await responseBody(response);

    if (!response.ok) {
      return NextResponse.json(
        {
          error: apiErrorMessage(response.status, apiBody),
          apiStatus: response.status,
          apiResponse: apiBody,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        created: true,
        apiStatus: response.status,
        relationId,
        contactPersonId: contactPersonIdFromResponse(apiBody),
        contactPerson: apiBody,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Testcontactpersoon aanmaken mislukt." },
      { status: 500 },
    );
  }
}
