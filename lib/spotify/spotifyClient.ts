import { getCredentials } from "../storage/credentialsStore";
import { getSession, setSession } from "../storage/sessionStore";

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

// Cache for client-credentials token to avoid repeated auth calls.
let appTokenCache: { token: string; expiresAt: number } | null = null;

export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const search = new URLSearchParams({
    response_type: "code",
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    code_challenge_method: "S256",
    code_challenge: params.codeChallenge,
    scope:
      "playlist-read-private playlist-read-collaborative user-library-read user-read-currently-playing",
    state: params.state
  });
  return `${SPOTIFY_AUTH_URL}?${search.toString()}`;
}

export async function exchangeCodeForToken(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier
  });
  const auth = Buffer.from(
    `${params.clientId}:${params.clientSecret}`
  ).toString("base64");
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });
  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status}).`);
  }
  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}

export async function refreshAccessToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: params.refreshToken
  });
  const auth = Buffer.from(
    `${params.clientId}:${params.clientSecret}`
  ).toString("base64");
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });
  if (!response.ok) {
    throw new Error(`Token refresh failed (${response.status}).`);
  }
  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}

async function fetchClientCredentialsToken(params: {
  clientId: string;
  clientSecret: string;
}) {
  const body = new URLSearchParams({
    grant_type: "client_credentials"
  });
  const auth = Buffer.from(
    `${params.clientId}:${params.clientSecret}`
  ).toString("base64");
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });
  if (!response.ok) {
    throw new Error(`Client credentials token failed (${response.status}).`);
  }
  return response.json() as Promise<{
    access_token: string;
    expires_in: number;
  }>;
}

export async function getAppAccessToken(sessionId: string) {
  if (appTokenCache && appTokenCache.expiresAt > Date.now()) {
    return appTokenCache.token;
  }

  const envClientId = process.env.SPOTIFY_CLIENT_ID;
  const envClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  let clientId = envClientId;
  let clientSecret = envClientSecret;

  if (!clientId || !clientSecret) {
    const credentials = await getCredentials(sessionId);
    if (!credentials) {
      throw new Error("Spotify credentials missing.");
    }
    clientId = credentials.clientId;
    clientSecret = credentials.clientSecret;
  }

  const token = await fetchClientCredentialsToken({
    clientId,
    clientSecret
  });
  appTokenCache = {
    token: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000 - 30_000
  };
  return appTokenCache.token;
}

export async function getValidAccessToken(sessionId: string) {
  const session = await getSession(sessionId);
  if (!session.refreshToken) {
    throw new Error("Spotify auth required.");
  }
  if (session.accessToken && session.expiresAt && session.expiresAt > Date.now()) {
    return session.accessToken;
  }
  const credentials = await getCredentials(sessionId);
  if (!credentials) {
    throw new Error("Spotify credentials missing.");
  }
  const refreshed = await refreshAccessToken({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    refreshToken: session.refreshToken
  });
  const expiresAt = Date.now() + refreshed.expires_in * 1000 - 30_000;
  await setSession(sessionId, {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? session.refreshToken,
    expiresAt
  });
  return refreshed.access_token;
}

export async function spotifyFetch(
  path: string,
  accessToken: string
): Promise<Response> {
  // Restrict outgoing Spotify API requests to known-safe paths.
  if (!path.startsWith("/")) {
    throw new Error("Invalid Spotify API path.");
  }
  const allowedPrefixes = ["/tracks", "/artists", "/albums", "/audio-features"];
  const isAllowed = allowedPrefixes.some((prefix) => path.startsWith(prefix));
  if (!isAllowed) {
    throw new Error("Disallowed Spotify API endpoint.");
  }

  return fetch(`${SPOTIFY_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function getRedirectUri(requestUrl: string): string {
  const baseUrl = getBaseUrl(requestUrl);
  return new URL("api/spotify/auth/callback", baseUrl).toString();
}

export function getAppBaseUrl(requestUrl: string): string {
  return getBaseUrl(requestUrl).toString();
}

function getBaseUrl(requestUrl: string): URL {
  const envBase = process.env.SPOTIFY_REDIRECT_BASE;
  if (envBase) {
    const url = new URL(envBase);
    url.pathname = ensureTrailingSlash(url.pathname || "/");
    url.search = "";
    url.hash = "";
    return url;
  }
  const url = new URL(requestUrl);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  url.pathname = ensureTrailingSlash(basePath || "/");
  url.search = "";
  url.hash = "";
  return url;
}

function ensureTrailingSlash(pathname: string) {
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}
