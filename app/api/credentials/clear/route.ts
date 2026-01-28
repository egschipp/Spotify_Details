import { NextRequest, NextResponse } from "next/server";
import { clearCredentials } from "@/lib/storage/credentialsStore";
import { attachSessionCookie, getSessionId } from "@/lib/storage/sessionCookie";
import { rateLimit, rateLimitHeaders } from "@/lib/security/rateLimit";

export async function POST(req: NextRequest) {
  const { sessionId, isNew } = getSessionId(req);
  const limit = rateLimit(`cred-clear:${sessionId}`, {
    windowMs: 60_000,
    max: 6
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again soon." },
      { status: 429, headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
  }
  await clearCredentials(sessionId);
  const res = NextResponse.json(
    { ok: true },
    { headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
  );
  attachSessionCookie(res, sessionId, isNew);
  return res;
}
