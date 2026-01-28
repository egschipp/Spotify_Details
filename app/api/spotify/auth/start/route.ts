import { NextRequest, NextResponse } from "next/server";
import { getCredentials } from "@/lib/storage/credentialsStore";
import { attachSessionCookie, getSessionId } from "@/lib/storage/sessionCookie";
import { setSession } from "@/lib/storage/sessionStore";
import { buildAuthorizeUrl, getRedirectUri } from "@/lib/spotify/spotifyClient";
import { generateCodeChallenge, generateCodeVerifier } from "@/lib/spotify/pkce";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const { sessionId, isNew } = getSessionId(req);
  const credentials = await getCredentials(sessionId);
  if (!credentials) {
    return NextResponse.json(
      { error: "No Spotify credentials saved." },
      { status: 400 }
    );
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomUUID();
  const redirectUri = getRedirectUri(req.url);

  await setSession(sessionId, {
    codeVerifier,
    authState: state
  });

  const url = buildAuthorizeUrl({
    clientId: credentials.clientId,
    redirectUri,
    codeChallenge,
    state
  });

  const res = NextResponse.redirect(url);
  attachSessionCookie(res, sessionId, isNew);
  return res;
}
