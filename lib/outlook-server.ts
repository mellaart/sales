import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { query } from "@/lib/local-db";

const OUTLOOK_SCOPE = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "https://graph.microsoft.com/Mail.ReadWrite",
].join(" ");
const TOKEN_PREFIX = "v1";
const SIMPLE_ATTACHMENT_MAX_SIZE = 3 * 1024 * 1024;
const LARGE_ATTACHMENT_CHUNK_SIZE = 10 * 320 * 1024;

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

type OutlookSignatureInput = {
  fullName: string;
  jobTitle: string;
  workdays: string;
  mobilePhone: string;
  email: string;
};

type OutlookAttachment = {
  fileName: string;
  contentType: string;
  fileContent: Buffer;
  isInline?: boolean;
  contentId?: string;
};

type MicrosoftErrorPayload = {
  error?: { message?: string };
};

const SIGNATURE_DISCLAIMER =
  "De inhoud van dit bericht is alleen bestemd voor de geadresseerde en kan vertrouwelijke of persoonlijke informatie bevatten. Als u dit bericht onbedoeld heeft ontvangen, verzoeken wij u het te vernietigen en de afzender te informeren. Het is niet toegestaan om een bericht dat niet voor u bestemd is te vermenigvuldigen dan wel te verspreiden. Aan dit bericht inclusief de bijlagen kunnen geen rechten ontleend worden, tenzij schriftelijk anders wordt overeengekomen. Troublefree B.V. aanvaardt geen enkele aansprakelijkheid voor schade en/of kosten die voortvloeien uit onvolledige en/of foutieve informatie in e-mailberichten.";

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

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character] ?? character,
  );
}

async function readSignatureAsset(fileName: string) {
  try {
    return await readFile(join(process.cwd(), "public", fileName));
  } catch {
    return null;
  }
}

async function createOutlookSignature(input: OutlookSignatureInput) {
  const [smartTradeLogo, troublefreeBadge] = await Promise.all([
    readSignatureAsset("smart-trade-logo.png"),
    readSignatureAsset("troublefree-software-badge.png"),
  ]);
  const fullName = escapeHtml(input.fullName || "Smart Trade");
  const jobTitle = escapeHtml(input.jobTitle);
  const workdays = escapeHtml(input.workdays);
  const mobilePhone = escapeHtml(input.mobilePhone);
  const mobileHref = escapeHtml(input.mobilePhone.replace(/[^\d+]/g, ""));
  const email = escapeHtml(input.email);
  const attachments: OutlookAttachment[] = [];

  if (smartTradeLogo) {
    attachments.push({
      fileName: "smart-trade-logo.png",
      contentType: "image/png",
      fileContent: smartTradeLogo,
      isInline: true,
      contentId: "smart-trade-logo",
    });
  }
  if (troublefreeBadge) {
    attachments.push({
      fileName: "troublefree-software-badge.png",
      contentType: "image/png",
      fileContent: troublefreeBadge,
      isInline: true,
      contentId: "troublefree-software-badge",
    });
  }

  const contactRows = [
    mobilePhone
      ? `<tr><td style="padding:0 8px 2px 0;font-weight:700">M</td><td style="padding:0 0 2px"><a href="tel:${mobileHref}" style="color:#2679d6;text-decoration:underline">${mobilePhone}</a></td></tr>`
      : "",
    '<tr><td style="padding:0 8px 2px 0;font-weight:700">T</td><td style="padding:0 0 2px"><a href="tel:+31252250260" style="color:#2679d6;text-decoration:underline">+31 252 250 260</a></td></tr>',
    email
      ? `<tr><td style="padding:0 8px 2px 0;font-weight:700">E</td><td style="padding:0 0 2px"><a href="mailto:${email}" style="color:#1f2937;text-decoration:underline">${email}</a></td></tr>`
      : "",
    '<tr><td style="padding:0 8px 2px 0;font-weight:700">W</td><td style="padding:0 0 2px"><a href="https://www.smarttrade.nl" style="color:#1f2937;text-decoration:underline">www.smarttrade.nl</a></td></tr>',
  ].filter(Boolean).join("");

  const html = [
    '<div style="margin-top:24pt;font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.35;color:#1f2937;mso-fareast-font-family:Calibri">',
    '<p style="margin:0 0 18pt">Met vriendelijke groet,</p>',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1f2937">',
    "<tr>",
    '<td valign="top" style="padding:0 28px 0 0;border-right:1px solid #2679d6;min-width:340px">',
    `<div style="margin:0;color:#2679d6;font-size:15pt;font-weight:700">${fullName}</div>`,
    jobTitle ? `<div style="margin:2px 0 16px">${jobTitle}</div>` : "",
    workdays
      ? `<div style="margin:0 0 16px"><strong>Werkdagen</strong>&nbsp; | &nbsp;${workdays}</div>`
      : "",
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1f2937">${contactRows}</table>`,
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1f2937">',
    "<tr>",
    troublefreeBadge
      ? '<td valign="top" style="padding:0 18px 0 0"><img src="cid:troublefree-software-badge" width="78" height="87" alt="Onderdeel van Troublefree Software" style="display:block;border:0"></td>'
      : "",
    '<td valign="top" style="padding:0"><strong>Troublefree B.V.</strong><br>Pletterij 1A<br>2211 JT Noordwijkerhout<br>Nederland</td>',
    "</tr>",
    "</table>",
    "</td>",
    smartTradeLogo
      ? '<td valign="middle" style="padding:12px 0 0 34px"><img src="cid:smart-trade-logo" width="220" alt="Smart Trade branchegerichte software" style="display:block;border:0;height:auto"></td>'
      : "",
    "</tr>",
    "</table>",
    `<p style="margin:22pt 0 0;max-width:760px;font-size:8pt;line-height:1.35;color:#1f2937">${escapeHtml(SIGNATURE_DISCLAIMER)}</p>`,
    "</div>",
  ].join("");

  return { html, attachments };
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

function outlookDraftComposeLink(webLink: string) {
  try {
    const url = new URL(webLink);
    const composePath = url.pathname.replace(
      /\/mail\/deeplink\/read(?=\/|$)/i,
      "/mail/deeplink/compose",
    );

    if (composePath === url.pathname) return webLink;

    url.pathname = composePath;
    url.searchParams.delete("viewmodel");
    url.searchParams.delete("viewModel");
    return url.toString();
  } catch {
    return webLink;
  }
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

async function deleteOutlookDraft(accessToken: string, draftId: string) {
  await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draftId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  ).catch(() => undefined);
}

async function addSmallOutlookAttachment(
  accessToken: string,
  draftId: string,
  attachment: OutlookAttachment,
) {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draftId)}/attachments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: attachment.fileName,
        contentType: attachment.contentType,
        contentBytes: attachment.fileContent.toString("base64"),
        isInline: attachment.isInline ?? false,
        contentId: attachment.contentId,
      }),
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => ({})) as MicrosoftErrorPayload;

  if (response.status === 401) {
    throw new OutlookReconnectRequiredError();
  }
  if (!response.ok) {
    throw new Error(
      payload.error?.message || "Een bijlage kon niet aan het Outlook-concept worden toegevoegd.",
    );
  }
}

async function addLargeOutlookAttachment(
  accessToken: string,
  draftId: string,
  attachment: OutlookAttachment,
) {
  const sessionResponse = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draftId)}/attachments/createUploadSession`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        AttachmentItem: {
          attachmentType: "file",
          name: attachment.fileName,
          size: attachment.fileContent.length,
          contentType: attachment.contentType,
          isInline: attachment.isInline ?? false,
          contentId: attachment.contentId,
        },
      }),
      cache: "no-store",
    },
  );
  const session = await sessionResponse.json().catch(() => ({})) as {
    uploadUrl?: string;
    error?: { message?: string };
  };

  if (sessionResponse.status === 401) {
    throw new OutlookReconnectRequiredError();
  }
  if (!sessionResponse.ok || !session.uploadUrl) {
    throw new Error(
      session.error?.message || "Outlook kon de upload voor de grote bijlage niet starten.",
    );
  }

  for (
    let start = 0;
    start < attachment.fileContent.length;
    start += LARGE_ATTACHMENT_CHUNK_SIZE
  ) {
    const endExclusive = Math.min(
      start + LARGE_ATTACHMENT_CHUNK_SIZE,
      attachment.fileContent.length,
    );
    const chunk = attachment.fileContent.subarray(start, endExclusive);
    const uploadBody = new ArrayBuffer(chunk.length);
    new Uint8Array(uploadBody).set(chunk);
    const uploadResponse = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${start}-${endExclusive - 1}/${attachment.fileContent.length}`,
        "Content-Type": "application/octet-stream",
      },
      body: uploadBody,
      cache: "no-store",
    });

    if (!uploadResponse.ok) {
      const payload = await uploadResponse.json().catch(() => ({})) as MicrosoftErrorPayload;
      throw new Error(
        payload.error?.message || "Een deel van de grote Outlook-bijlage kon niet worden geüpload.",
      );
    }
  }
}

export async function createOutlookDraft(
  request: Request,
  userId: string,
  input: {
    recipientEmail: string;
    ccRecipientEmails?: string[];
    subject: string;
    htmlBody: string;
    signature?: OutlookSignatureInput;
    attachments?: OutlookAttachment[];
    fileName?: string;
    fileContent?: Buffer;
  },
) {
  const accessToken = await getOutlookAccessToken(request, userId);
  const authorizationHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const signature = input.signature
    ? await createOutlookSignature(input.signature)
    : { html: "", attachments: [] as OutlookAttachment[] };
  const htmlBody = [
    '<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1f2937;mso-fareast-font-family:Calibri">',
    input.htmlBody,
    signature.html,
    "</div>",
  ].join("");
  const draftResponse = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
    method: "POST",
    headers: authorizationHeaders,
    body: JSON.stringify({
      subject: input.subject,
      body: {
        contentType: "HTML",
        content: htmlBody,
      },
      toRecipients: [
        {
          emailAddress: {
            address: input.recipientEmail,
          },
        },
      ],
      ccRecipients: (input.ccRecipientEmails ?? []).map((email) => ({
        emailAddress: { address: email },
      })),
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
  const composeLink = outlookDraftComposeLink(draft.webLink);

  const attachments = [...(input.attachments ?? []), ...signature.attachments];
  if (input.fileName && input.fileContent) {
    attachments.unshift({
      fileName: input.fileName,
      contentType: "application/pdf",
      fileContent: input.fileContent,
    });
  }

  if (attachments.length === 0) {
    return composeLink;
  }

  for (const attachment of attachments) {
    try {
      if (attachment.fileContent.length < SIMPLE_ATTACHMENT_MAX_SIZE) {
        await addSmallOutlookAttachment(accessToken, draft.id, attachment);
      } else {
        await addLargeOutlookAttachment(accessToken, draft.id, attachment);
      }
    } catch (error) {
      await deleteOutlookDraft(accessToken, draft.id);

      if (error instanceof OutlookReconnectRequiredError) {
        await query("delete from public.outlook_connections where user_id = $1", [userId]);
      }
      throw error;
    }
  }

  return composeLink;
}

export function outlookRequestOrigin(request: Request) {
  return requestOrigin(request);
}
