import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import {
  fetchWithSmartTradeTimeout,
  getSmartTradePullConfig,
  getSmartTradePullHeaders,
} from "@/lib/smart-trade-pull-test";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CreateAddressBody = {
  street?: unknown;
  city?: unknown;
  number?: unknown;
  postcode?: unknown;
  district?: unknown;
  addressName?: unknown;
  country?: unknown;
  isContact?: unknown;
  isDelivery?: unknown;
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

function addressIdFromResponse(body: unknown) {
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
      return NextResponse.json({ error: "Alleen een admin kan testadressen aanmaken." }, { status: 403 });
    }

    const { relationId: rawRelationId } = await context.params;
    const relationId = rawRelationId.trim();
    if (!/^\d+$/.test(relationId) || Number(relationId) < 1) {
      return NextResponse.json({ error: "Vul een geldig relatie-ID in." }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as CreateAddressBody | null;
    const payload = {
      street: textValue(body?.street, 180),
      city: textValue(body?.city, 120),
      number: textValue(body?.number, 30),
      postcode: textValue(body?.postcode, 20).toUpperCase(),
      district: textValue(body?.district, 120),
      addressName: textValue(body?.addressName, 120) || "Hoofdadres",
      gln: "",
      country: (textValue(body?.country, 2) || "NL").toUpperCase(),
      isContact: body?.isContact !== false,
      isDelivery: body?.isDelivery !== false,
    };

    if (!payload.street || !payload.number || !payload.postcode || !payload.city) {
      return NextResponse.json(
        { error: "Straat, huisnummer, postcode en plaats zijn verplicht." },
        { status: 400 },
      );
    }

    if (!/^[A-Z]{2}$/.test(payload.country)) {
      return NextResponse.json({ error: "Landcode moet uit twee letters bestaan, bijvoorbeeld NL." }, { status: 400 });
    }

    const config = getSmartTradePullConfig("test");
    const targetUrl = new URL(`/api/v1/relations/${relationId}/addresses`, config.baseUrl).toString();
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
        addressId: addressIdFromResponse(apiBody),
        address: apiBody,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Testadres aanmaken mislukt." },
      { status: 500 },
    );
  }
}
