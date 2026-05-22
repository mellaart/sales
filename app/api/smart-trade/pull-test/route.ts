import { NextResponse } from "next/server";
import { fillPathTemplate, getApiTestEndpoint, retailApiBasePath } from "@/lib/retail-api-endpoints";
import {
  fetchWithSmartTradeTimeout,
  getSmartTradePullConfig,
  getSmartTradePullHeaders,
} from "@/lib/smart-trade-pull-test";

export const dynamic = "force-dynamic";

type PullBody = {
  pathTemplate?: string;
  pathParams?: Record<string, unknown>;
  queryString?: string;
  ifModifiedSince?: string;
  ifNoneMatch?: string;
};

function pathSegments(path: string) {
  return path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
}

function matchingBasePathOverlap(baseSegments: string[], swaggerSegments: string[]) {
  const max = Math.min(baseSegments.length, swaggerSegments.length);

  for (let size = max; size > 0; size -= 1) {
    const baseTail = baseSegments.slice(baseSegments.length - size).join("/");
    const swaggerHead = swaggerSegments.slice(0, size).join("/");

    if (baseTail === swaggerHead) return size;
  }

  return 0;
}

function applyQuery(target: URL, queryString?: string) {
  target.search = "";

  if (queryString?.trim()) {
    const params = new URLSearchParams(queryString.trim().replace(/^\?/, ""));
    params.forEach((value, key) => {
      if (key.trim() && value.trim()) target.searchParams.append(key, value);
    });
  }

  return target;
}

function buildPrimaryUrl(endpointPath: string, queryString?: string) {
  const config = getSmartTradePullConfig();
  const target = new URL(config.baseUrl);
  const baseSegments = pathSegments(target.pathname);
  const swaggerSegments = pathSegments(retailApiBasePath);
  const overlap = matchingBasePathOverlap(baseSegments, swaggerSegments);

  target.pathname = `/${[
    ...baseSegments,
    ...swaggerSegments.slice(overlap),
    ...pathSegments(endpointPath),
  ].join("/")}`;

  return applyQuery(target, queryString);
}

function buildTargetUrls(endpointPath: string, queryString?: string) {
  const config = getSmartTradePullConfig();
  const primary = buildPrimaryUrl(endpointPath, queryString);
  const cleanEndpointPath = `/${pathSegments(endpointPath).join("/")}`;
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const withoutApiSuffix = baseUrl.replace(/\/api$/i, "");
  const origin = new URL(config.baseUrl).origin;
  const candidates = [
    primary,
    new URL(`${baseUrl}/api${cleanEndpointPath}`),
    new URL(`${withoutApiSuffix}${cleanEndpointPath}`),
    new URL(`${origin}/v3/api${cleanEndpointPath}`),
  ].map((url) => applyQuery(url, queryString));
  const seen = new Set<string>();

  return candidates.filter((url) => {
    const key = url.toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeHeaders(headers: Headers) {
  const hiddenHeaders = new Set(["authorization", "set-cookie", "cookie"]);

  return Object.fromEntries(
    [...headers.entries()].filter(([name]) => !hiddenHeaders.has(name.toLowerCase())),
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PullBody;
    const pathTemplate = body.pathTemplate ?? "";
    const endpoint = getApiTestEndpoint(pathTemplate);

    if (!endpoint) {
      return NextResponse.json({ error: "Deze route staat niet als GET-route in de Swagger." }, { status: 400 });
    }

    const endpointPath = fillPathTemplate(pathTemplate, body.pathParams ?? {});
    const targetUrls = buildTargetUrls(endpointPath, body.queryString);
    const extraHeaders: Record<string, string> = {};

    if (body.ifModifiedSince?.trim()) {
      extraHeaders["If-Modified-Since"] = body.ifModifiedSince.trim();
    }

    if (body.ifNoneMatch?.trim()) {
      extraHeaders["If-None-Match"] = body.ifNoneMatch.trim();
    }

    const headers = getSmartTradePullHeaders(extraHeaders);
    const startedAt = Date.now();
    const attempts: Array<{ url: string; status: number }> = [];
    let response: Response | null = null;
    let targetUrl = targetUrls[0];

    for (const candidateUrl of targetUrls) {
      const candidateResponse = await fetchWithSmartTradeTimeout(candidateUrl.toString(), headers);
      attempts.push({ url: candidateUrl.toString(), status: candidateResponse.status });

      response = candidateResponse;
      targetUrl = candidateUrl;

      if (candidateResponse.status !== 505) {
        break;
      }
    }

    if (!response) {
      throw new Error("Geen API response ontvangen.");
    }

    const responseBuffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "";
    const isJson = /(^|[/+])json($|;)/i.test(contentType);
    const isText = /^text\//i.test(contentType) || /xml|csv|html/i.test(contentType);
    let responseBody: unknown = null;
    let responseText = "";

    if (responseBuffer.length && (isJson || isText || responseBuffer.length < 300000)) {
      responseText = responseBuffer.toString("utf8");
      responseBody = responseText;

      if (isJson) {
        try {
          responseBody = JSON.parse(responseText) as unknown;
        } catch {
          responseBody = responseText;
        }
      }
    }

    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: targetUrl.toString(),
      durationMs: Date.now() - startedAt,
      contentType,
      byteLength: responseBuffer.length,
      headers: safeHeaders(response.headers),
      body: responseBody,
      bodyText: responseText,
      attempts,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Pull mislukt.",
      },
      { status: 500 },
    );
  }
}
