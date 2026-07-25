import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { query } from "@/lib/local-db";

const OUTLOOK_SCOPE = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "https://graph.microsoft.com/Mail.ReadWrite",
].join(" ");
const TOKEN_PREFIX = "v1";

type OutlookConnectionRow = {
  refresh_token_encrypted: string;
};

type OutlookStateRow = {
  return_to: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

export class OutlookReconnectRequiredError extends Error {
  constructor(message = "Outlook moet opnieuw worden verbonden.") {
    super(message);
    this.name = "OutlookReconnectRequiredError";
  }
}

function outlookConfiguration() {
  const clientId = process.env.MICROSOFT_OUTLOOK_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.MICROSOFT_OUTLOOK_CLIENT_SECRET?.trim() ?? "";
  const tenantId = process.env.MICROSOFT_OUTLOOK_TENANT_ID?.trim() || "organizations";

  if (!clientId || !clientSecret) {
    throw new Error(
      "Outlook-koppeling is nog niet geconfigureerd. Voeg MICROSOFT_OUTLOOK_CLIENT_ID en MICROSOFT_OUTLOOK_CLIENT_SECRET toe aan .env.local.",
    );
  }

  return { clientId, clientSecret, tenantId };
}

function encryptionKey() {
  const material = (
    process.env.SALES_OUTLOOK_ENCRYPTION_KEY ||
    process.env.SALES_2FA_ENCRYPTION_KEY ||
    process.env.LOCAL_AUTH_SECRET ||
    ""
  ).trim();

  if (!material) {
    throw new Error(
      "Outlook-versleutelingssleutel ontbreekt. Voeg SALES_OUTLOOK_ENCRYPTION_KEY toe aan .env.local.",
    );
  }

  return createHash("sha256").update(material).digest();
}

function encryptRefreshToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    TOKEN_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

function decryptRefreshToken(value: string) {
  const [prefix, ivText, tagText, encryptedText] = value.split(":");
  if (prefix !== TOKEN_PREFIX || !ivText || !tagText || !encryptedText) {
    throw new OutlookReconnectRequiredError("De opgeslagen Outlook-koppeling is ongeldig.");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivText, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new OutlookReconnectRequiredError("De Outlook-koppeling kon niet worden ontsleuteld.");
  }
}

function requestOrigin(request: Request) {
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

function redirectUri(request: Request) {
  return `${requestOrigin(request)}/api/outlook/callback`;
}

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value.slice(0, 500);
}

function stateHash(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

async function requestTokens(
  request: Request,
  values: Record<string, string>,
): Promise<TokenResponse> {
  const { clientId, clientSecret, tenantId } = outlookConfiguration();
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: OUTLOOK_SCOPE,
        redirect_uri: redirectUri(request),
        ...values,
      }),
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => ({})) as TokenResponse;

  if (!response.ok || !payload.access_token) {
    const error = new Error(
      payload.error_description || "Microsoft kon geen toegang tot Outlook verlenen.",
    );
    Object.assign(error, { tokenStatus: response.status, tokenCode: payload.error });
    throw error;
  }

  return payload;
}

export function getOutlookConnectUrl(request: Request, returnTo?: string | null) {
  const url = new URL("/api/outlook/connect", requestOrigin(request));
  url.searchParams.set("returnTo", safeReturnTo(returnTo ?? "/"));
  return url.toString();
}

export async function isOutlookConnected(userId: string) {
  outlookConfiguration();
  encryptionKey();

  const { rows } = await query<{ connected: boolean }>(
    `select exists(
       select 1 from public.outlook_connections where user_id = $1
     ) as connected`,
    [userId],
  );

  return rows[0]?.connected === true;
}

export async function createOutlookAuthorizationUrl(
  request: Request,
  userId: string,
  returnTo?: string | null,
) {
  const { clientId, tenantId } = outlookConfiguration();
  encryptionKey();

  const state = randomBytes(32).toString("base64url");
  await query("delete from public.outlook_oauth_states where expires_at <= now()");
  await query(
    `insert into public.outlook_oauth_states
       (state_hash, user_id, return_to, expires_at)
     values ($1, $2, $3, now() + interval '10 minutes')`,
    [stateHash(state), userId, safeReturnTo(returnTo ?? "/")],
  );

  const url = new URL(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize`,
  );
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri(request));
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", OUTLOOK_SCOPE);
  url.searchParams.set("state", state);

  return url.toString();
}

export async function completeOutlookAuthorization(
  request: Request,
  userId: string,
  code: string,
  state: string,
) {
  const { rows } = await query<OutlookStateRow>(
    `delete from public.outlook_oauth_states
     where state_hash = $1
       and user_id = $2
       and expires_at > now()
     returning return_to`,
    [stateHash(state), userId],
  );
  const savedState = rows[0];
  if (!savedState) {
    throw new Error("De Outlook-aanvraag is verlopen of hoort niet bij deze gebruiker.");
  }

  const tokens = await requestTokens(request, {
    grant_type: "authorization_code",
    code,
  });
  if (!tokens.refresh_token) {
    throw new Error("Microsoft heeft geen blijvende Outlook-toegang teruggegeven.");
  }

  await query(
    `insert into public.outlook_connections
       (user_id, refresh_token_encrypted, scope, connected_at, updated_at)
     values ($1, $2, $3, now(), now())
     on conflict (user_id) do update
       set refresh_token_encrypted = excluded.refresh_token_encrypted,
           scope = excluded.scope,
           connected_at = now(),
           updated_at = now()`,
    [userId, encryptRefreshToken(tokens.refresh_token), tokens.scope ?? OUTLOOK_SCOPE],
  );

  return savedState.return_to;
}

async function getOutlookAccessToken(request: Request, userId: string) {
  const { rows } = await query<OutlookConnectionRow>(
    `select refresh_token_encrypted
     from public.outlook_connections
     where user_id = $1
     limit 1`,
    [userId],
  );
  const connection = rows[0];
  if (!connection) throw new OutlookReconnectRequiredError();

  const refreshToken = decryptRefreshToken(connection.refresh_token_encrypted);

  try {
    const tokens = await requestTokens(request, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    if (tokens.refresh_token) {
      await query(
        `update public.outlook_connections
         set refresh_token_encrypted = $2,
             scope = $3,
             updated_at = now()
         where user_id = $1`,
        [userId, encryptRefreshToken(tokens.refresh_token), tokens.scope ?? OUTLOOK_SCOPE],
      );
    }

    return tokens.access_token as string;
  } catch (error) {
    const tokenStatus = (error as { tokenStatus?: number }).tokenStatus;
    if (tokenStatus === 400 || tokenStatus === 401) {
      await query("delete from public.outlook_connections where user_id = $1", [userId]);
      throw new OutlookReconnectRequiredError();
    }
    throw error;
  }
}

export async function createOutlookDraft(
  request: Request,
  userId: string,
  input: {
    recipientEmail: string;
    subject: string;
    htmlBody: string;
    fileName: string;
    fileContent: Buffer;
  },
) {
  const accessToken = await getOutlookAccessToken(request, userId);
  const authorizationHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const draftResponse = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
    method: "POST",
    headers: authorizationHeaders,
    body: JSON.stringify({
      subject: input.subject,
      body: {
        contentType: "HTML",
        content: input.htmlBody,
      },
      toRecipients: [
        {
          emailAddress: {
            address: input.recipientEmail,
          },
        },
      ],
    }),
    cache: "no-store",
  });
  const draft = await draftResponse.json().catch(() => ({})) as {
    id?: string;
    webLink?: string;
    error?: { message?: string };
  };

  if (draftResponse.status === 401) {
    await query("delete from public.outlook_connections where user_id = $1", [userId]);
    throw new OutlookReconnectRequiredError();
  }
  if (!draftResponse.ok || !draft.id || !draft.webLink) {
    throw new Error(draft.error?.message || "Outlook kon het concept niet aanmaken.");
  }

  const attachmentResponse = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draft.id)}/attachments`,
    {
      method: "POST",
      headers: authorizationHeaders,
      body: JSON.stringify({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: input.fileName,
        contentType: "application/pdf",
        contentBytes: input.fileContent.toString("base64"),
      }),
      cache: "no-store",
    },
  );
  const attachmentPayload = await attachmentResponse.json().catch(() => ({})) as {
    error?: { message?: string };
  };

  if (!attachmentResponse.ok) {
    await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draft.id)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      },
    ).catch(() => undefined);

    if (attachmentResponse.status === 401) {
      await query("delete from public.outlook_connections where user_id = $1", [userId]);
      throw new OutlookReconnectRequiredError();
    }
    throw new Error(
      attachmentPayload.error?.message || "De offerte kon niet aan het Outlook-concept worden toegevoegd.",
    );
  }

  return draft.webLink;
}

export function outlookRequestOrigin(request: Request) {
  return requestOrigin(request);
}
