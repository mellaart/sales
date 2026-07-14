import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import {
  fetchWithSmartTradeTimeout,
  getSmartTradePullConfig,
  getSmartTradePullHeaders,
} from "@/lib/smart-trade-pull-test";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TEST_RELATION_DEFAULTS = {
  group_id: 7,
  type: 2,
  mailinglist: 1,
  status: 3,
} as const;

type CreateRelationBody = {
  company?: unknown;
  phone?: unknown;
  email?: unknown;
  contactEmail?: unknown;
  website?: unknown;
  vatNumber?: unknown;
  chamberOfCommerceNumber?: unknown;
};

function textValue(value: unknown, maxLength = 255) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function relationIdFromResponse(body: unknown, location: string | null) {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const rawData = record.data;
    const data = rawData && typeof rawData === "object"
      ? (record.data as Record<string, unknown>)
      : null;
    const id = data?.id ?? record.id ??
      (typeof rawData === "string" || typeof rawData === "number" ? rawData : null);

    if (typeof id === "string" || typeof id === "number") {
      const normalizedId = String(id).trim();
      if (normalizedId) return normalizedId;
    }
  }

  if (location) {
    const match = location.match(/\/relations\/([^/?#]+)\/?(?:[?#].*)?$/i);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }

  return null;
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
        .flatMap(([field, value]) => {
          const messages = Array.isArray(value) ? value : [value];
          return messages
            .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
            .map((item) => `${field}: ${item.trim()}`);
        })
        .join(" ");

      if (details) {
        const prefix = typeof message === "string" && message.trim() ? `${message.trim()} ` : "";
        return `${prefix}${details}`.trim();
      }
    }

    if (typeof message === "string" && message.trim()) return message.trim();
  }

  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 700);
  return `Smart Trade API gaf status ${status}.`;
}

export async function POST(request: Request) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message }, { status: 401 });
    }

    if (verified.profile.role !== "admin") {
      return NextResponse.json({ error: "Alleen een admin kan testrelaties aanmaken." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as CreateRelationBody | null;
    const company = textValue(body?.company, 180);

    if (!company) {
      return NextResponse.json({ error: "Bedrijf is verplicht." }, { status: 400 });
    }

    const payload = {
      company,
      ...TEST_RELATION_DEFAULTS,
      phone: textValue(body?.phone, 80),
      email: textValue(body?.email, 180),
      contactEmail: textValue(body?.contactEmail, 180),
      website: textValue(body?.website, 240),
      vatNumber: textValue(body?.vatNumber, 60),
      chamberOfCommerceNumber: textValue(body?.chamberOfCommerceNumber, 60),
    };

    const config = getSmartTradePullConfig("test");
    const targetUrl = new URL("/api/v1/relations", config.baseUrl).toString();
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

    const relationId = relationIdFromResponse(apiBody, response.headers.get("location"));

    return NextResponse.json(
      {
        ok: true,
        created: true,
        apiStatus: response.status,
        relationId,
        relation: apiBody,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Testrelatie aanmaken mislukt." },
      { status: 500 },
    );
  }
}
