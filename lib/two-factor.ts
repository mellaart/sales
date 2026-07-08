import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ENCRYPTION_PREFIX = "v1";

function getEncryptionMaterials() {
  return [
    process.env.SALES_2FA_ENCRYPTION_KEY ||
      process.env.LOCAL_AUTH_SECRET ||
      process.env.SALES_BOOTSTRAP_ADMIN_PASSWORD ||
      process.env.PGPASSWORD ||
      process.env.DATABASE_URL ||
      process.env.SALES_BOOTSTRAP_ADMIN_EMAIL ||
      "smarttrade-sales-2fa",
    process.env.SALES_BOOTSTRAP_ADMIN_PASSWORD ||
      process.env.PGPASSWORD ||
      process.env.DATABASE_URL ||
      process.env.SALES_BOOTSTRAP_ADMIN_EMAIL ||
      "smarttrade-sales-2fa",
  ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
}

function getEncryptionKeys() {
  return getEncryptionMaterials().map((material) => createHash("sha256").update(material).digest());
}

function base32Encode(buffer: Buffer) {
  let output = "";
  let bits = 0;
  let value = 0;

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(secret: string) {
  const cleanSecret = secret.replace(/[\s=]/g, "").toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const character of cleanSecret) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function hotp(secret: string, counter: number) {
  const key = base32Decode(secret);
  const message = Buffer.alloc(8);
  message.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  message.writeUInt32BE(counter >>> 0, 4);

  const hmac = createHmac("sha1", key).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, "0");
}

export function generateTwoFactorSecret() {
  return base32Encode(randomBytes(20));
}

export function normalizeTotpCode(code: string) {
  return code.replace(/\D/g, "").slice(0, 6);
}

export function verifyTotpCode(secret: string, code: string, timestamp = Date.now()) {
  const normalizedCode = normalizeTotpCode(code);
  if (normalizedCode.length !== 6) return false;

  const counter = Math.floor(timestamp / 1000 / 30);
  const received = Buffer.from(normalizedCode);

  for (let offset = -1; offset <= 1; offset += 1) {
    const expected = Buffer.from(hotp(secret, counter + offset));
    if (expected.length === received.length && timingSafeEqual(expected, received)) {
      return true;
    }
  }

  return false;
}

export function createOtpAuthUrl(input: { issuer: string; email: string; secret: string }) {
  const label = `${input.issuer}:${input.email}`;
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });

  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export function encryptTwoFactorSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKeys()[0], iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptTwoFactorSecret(value: string) {
  if (!value.startsWith(`${ENCRYPTION_PREFIX}:`)) return value;

  const [, ivText, tagText, encryptedText] = value.split(":");
  if (!ivText || !tagText || !encryptedText) {
    throw new Error("2FA sleutel is ongeldig opgeslagen.");
  }

  for (const key of getEncryptionKeys()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
      decipher.setAuthTag(Buffer.from(tagText, "base64url"));

      return Buffer.concat([
        decipher.update(Buffer.from(encryptedText, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      // Try the next configured key candidate.
    }
  }

  throw new Error("2FA sleutel kon niet ontsleuteld worden.");
}
