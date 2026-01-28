import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, getSessionId } from "@/lib/storage/sessionCookie";
import { getSession } from "@/lib/storage/sessionStore";

export async function GET(req: NextRequest) {
  const { sessionId, isNew } = getSessionId(req);
  const session = await getSession(sessionId);
  const authenticated = Boolean(session.refreshToken);
  const res = NextResponse.json({ authenticated });
  attachSessionCookie(res, sessionId, isNew);
  return res;
}
