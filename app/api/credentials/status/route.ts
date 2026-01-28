import { NextRequest, NextResponse } from "next/server";
import { getCredentialStatus } from "@/lib/storage/credentialsStore";
import { attachSessionCookie, getSessionId } from "@/lib/storage/sessionCookie";

export async function GET(req: NextRequest) {
  const { sessionId, isNew } = getSessionId(req);
  const status = await getCredentialStatus(sessionId);
  const res = NextResponse.json(status);
  attachSessionCookie(res, sessionId, isNew);
  return res;
}
