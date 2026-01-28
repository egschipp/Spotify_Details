import { NextRequest, NextResponse } from "next/server";
import { clearCredentials } from "@/lib/storage/credentialsStore";
import { attachSessionCookie, getSessionId } from "@/lib/storage/sessionCookie";

export async function POST(req: NextRequest) {
  const { sessionId, isNew } = getSessionId(req);
  await clearCredentials(sessionId);
  const res = NextResponse.json({ ok: true });
  attachSessionCookie(res, sessionId, isNew);
  return res;
}
