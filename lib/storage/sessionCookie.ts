import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "spotify_details_sid";

export function getSessionId(req: NextRequest): {
  sessionId: string;
  isNew: boolean;
} {
  const existing = req.cookies.get(COOKIE_NAME)?.value;
  if (existing) {
    return { sessionId: existing, isNew: false };
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
  res.cookies.set({
    name: COOKIE_NAME,
    value: sessionId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
}
