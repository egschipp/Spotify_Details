import crypto from "crypto";

const KEY_LENGTH = 32;

type EncryptedPayload = {
  iv: string;
  tag: string;
  data: string;
  version: 1;
};

function parseKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const buf = Buffer.from(trimmed, "base64");
  if (buf.length === KEY_LENGTH) {
    return buf;
  }
  throw new Error(
    "SPOTIFY_CRED_ENCRYPTION_KEY must be 32 bytes (hex or base64)."
  );
}

function getKey(): Buffer {
  const raw = process.env.SPOTIFY_CRED_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("SPOTIFY_CRED_ENCRYPTION_KEY is not set.");
  }
  return parseKey(raw);
}

export function encryptSecret(secret: string): EncryptedPayload {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
    version: 1
  };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const key = getKey();
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const data = Buffer.from(payload.data, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

export type { EncryptedPayload };
