import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import { fillPathTemplate, getApiTestEndpoint } from "@/lib/retail-api-endpoints";
import {
  fetchWithSmartTradeTimeout,
  getSmartTradePullConfig,
  getSmartTradePullHeaders,
  type SmartTradePullEnvironment,
} from "@/lib/smart-trade-pull-test";

export const dynamic = "force-dynamic";

type PullBody = {
  environment?: SmartTradePullEnvironment;
  pathTemplate?: string;
  pathParams?: Record<string, unknown>;
  queryString?: string;
  ifModifiedSince?: string;
  ifNoneMatch?: string;
};

function pathSegments(path: string) {
  return path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
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

function buildTargetUrl(
  environment: SmartTradePullEnvironment,
  endpointPath: string,
  queryString?: string,
) {
  const config = getSmartTradePullConfig(environment);
  const target = new URL(config.baseUrl);
  const basePath = target.pathname.replace(/\/+$/, "");
  const endpoint = pathSegments(endpointPath).join("/");

  target.pathname = `${basePath}/${endpoint}`.replace(/\/{2,}/g, "/");

  return applyQuery(target, queryString);
}

function safeHeaders(headers: Headers) {
  const hiddenHeaders = new Set(["authorization", "set-cookie", "cookie"]);

  return Object.fromEntries(
    [...headers.entries()].filter(([name]) => !hiddenHeaders.has(name.toLowerCase())),
  );
}

function isVersionDetectionError(status: number, bodyText: string) {
  return status === 505 || /Error while determining version/i.test(bodyText);
}

export async function POST(request: Request) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message }, { status: 401 });
    }

    const body = (await request.json()) as PullBody;
    const environment: SmartTradePullEnvironment = body.environment === "test" ? "test" : "live";
    const pathTemplate = body.pathTemplate ?? "";
    const endpoint = getApiTestEndpoint(pathTemplate);

    if (!endpoint) {
      return NextResponse.json({ error: "Deze route staat niet als GET-route in de Swagger." }, { status: 400 });
    }

    const endpointPath = fillPathTemplate(pathTemplate, body.pathParams ?? {});
    const targetUrl = buildTargetUrl(environment, endpointPath, body.queryString);
    const extraHeaders: Record<string, string> = {};

    if (body.ifModifiedSince?.trim()) {
      extraHeaders["if-modified-since"] = body.ifModifiedSince.trim();
    }

    if (body.ifNoneMatch?.trim()) {
      extraHeaders["if-none-match"] = body.ifNoneMatch.trim();
    }

    const headers = getSmartTradePullHeaders(environment, extraHeaders);
    const startedAt = Date.now();
    const response = await fetchWithSmartTradeTimeout(targetUrl.toString(), headers, environment);
    const responseBuffer = Buffer.from(await response.arrayBuffer());
    const rawResponseText = responseBuffer.toString("utf8");
    const contentType = response.headers.get("content-type") ?? "";
    const isJson = /(^|[/+])json($|;)/i.test(contentType);
    const isText = /^text\//i.test(contentType) || /xml|csv|html/i.test(contentType);
    let responseBody: unknown = null;
    let responseText = "";

    if (responseBuffer.length && (isJson || isText || responseBuffer.length < 300000)) {
      responseText = rawResponseText;
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
      environment,
      status: response.status,
      statusText: response.statusText,
      url: targetUrl.toString(),
      durationMs: Date.now() - startedAt,
      contentType,
      byteLength: responseBuffer.length,
      headers: safeHeaders(response.headers),
      body: responseBody,
      bodyText: responseText,
      attempts: [
        {
          url: targetUrl.toString(),
          status: response.status,
          versionError: isVersionDetectionError(response.status, rawResponseText),
          bodyPreview: rawResponseText.slice(0, 160),
        },
      ],
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
