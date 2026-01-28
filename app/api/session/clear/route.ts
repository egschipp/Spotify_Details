import { NextRequest, NextResponse } from "next/server";
import { clearCredentials } from "@/lib/storage/credentialsStore";
import { clearSession } from "@/lib/storage/sessionStore";
import { getSessionId } from "@/lib/storage/sessionCookie";
import { rateLimit, rateLimitHeaders } from "@/lib/security/rateLimit";

const COOKIE_NAME = "spotify_details_sid";

export async function POST(req: NextRequest) {
  const { sessionId } = getSessionId(req);
  const limit = rateLimit(`session-clear:${sessionId}`, {
    windowMs: 60_000,
    max: 6
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again soon." },
      { status: 429, headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
  }
  try {
    await clearSession(sessionId);
    await clearCredentials(sessionId);
    const res = NextResponse.json(
      { ok: true },
      { headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
    res.cookies.set({
      name: COOKIE_NAME,
      value: "",
      maxAge: 0,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
    return res;
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
