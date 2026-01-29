import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "spotify_details_sid";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function parseKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const buf = Buffer.from(trimmed, "base64");
  if (buf.length === 32) {
    return buf;
  }
  throw new Error(
    "SPOTIFY_SESSION_SIGNING_KEY must be 32 bytes (hex or base64)."
  );
}

function getSigningKey(): Buffer {
  const raw =
    process.env.SPOTIFY_SESSION_SIGNING_KEY ??
    process.env.SPOTIFY_CRED_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SPOTIFY_SESSION_SIGNING_KEY (or SPOTIFY_CRED_ENCRYPTION_KEY) is not set."
    );
  }
  return parseKey(raw);
}

function signSessionId(sessionId: string): string {
  const key = getSigningKey();
  const hmac = crypto.createHmac("sha256", key).update(sessionId).digest("base64url");
  return `${sessionId}.${hmac}`;
}

function verifySessionId(value: string): string | null {
  const [sessionId, signature] = value.split(".");
  if (!sessionId || !signature) {
    return null;
  }
  const key = getSigningKey();
  const expected = crypto
    .createHmac("sha256", key)
    .update(sessionId)
    .digest("base64url");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ? sessionId
    : null;
}

export function getSessionId(req: NextRequest): {
  sessionId: string;
  isNew: boolean;
} {
  const existing = req.cookies.get(COOKIE_NAME)?.value;
  if (existing) {
    const verified = verifySessionId(existing);
    if (verified) {
      return { sessionId: verified, isNew: false };
    }
  }
  return { sessionId: crypto.randomUUID(), isNew: true };
}

export function attachSessionCookie(
  res: NextResponse,
  sessionId: string,
  isNew: boolean
) {
  if (!isNew) {
    return;
  }
  const isProd = process.env.NODE_ENV === "production";
  const sameSite = isProd ? "none" : "lax";
  res.cookies.set({
    name: COOKIE_NAME,
    value: signSessionId(sessionId),
    httpOnly: true,
    sameSite,
    secure: isProd,
    path: "/",
    maxAge: MAX_AGE_SECONDS
  });
}
