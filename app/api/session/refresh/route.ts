import { NextRequest, NextResponse } from "next/server";
import { getSessionId, setSessionCookie } from "@/lib/storage/sessionCookie";

export async function POST(req: NextRequest) {
  const { sessionId } = getSessionId(req);
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, sessionId);
  return res;
}
