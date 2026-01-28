import { NextRequest, NextResponse } from "next/server";
import { saveCredentials } from "@/lib/storage/credentialsStore";
import { attachSessionCookie, getSessionId } from "@/lib/storage/sessionCookie";

export async function POST(req: NextRequest) {
  const { sessionId, isNew } = getSessionId(req);
  try {
    const body = (await req.json()) as {
      clientId?: string;
      clientSecret?: string;
    };
    if (!body.clientId || !body.clientSecret) {
      return NextResponse.json(
        { error: "Client ID and Client Secret are required." },
        { status: 400 }
      );
    }
    await saveCredentials(sessionId, body.clientId.trim(), body.clientSecret);
    const res = NextResponse.json({ ok: true });
    attachSessionCookie(res, sessionId, isNew);
    return res;
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
