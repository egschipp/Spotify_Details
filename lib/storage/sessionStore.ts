import { readJsonFile, writeJsonFile } from "./storageUtils";
import { decryptSecret, encryptSecret, EncryptedPayload } from "./encryption";

export type SessionRecord = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  codeVerifier?: string;
  authState?: string;
};

type StoredSessionRecord = {
  accessToken?: EncryptedPayload | string;
  refreshToken?: EncryptedPayload | string;
  expiresAt?: number;
  codeVerifier?: EncryptedPayload | string;
  authState?: EncryptedPayload | string;
};

type SessionMap = Record<string, StoredSessionRecord>;

const FILE_NAME = "sessions.json";

export async function getSession(sessionId: string): Promise<SessionRecord> {
  const sessions = await readJsonFile<SessionMap>(FILE_NAME, {});
  const stored = sessions[sessionId];
  if (!stored) {
    return {};
  }
  return {
    accessToken: decryptMaybe(stored.accessToken),
    refreshToken: decryptMaybe(stored.refreshToken),
    expiresAt: stored.expiresAt,
    codeVerifier: decryptMaybe(stored.codeVerifier),
    authState: decryptMaybe(stored.authState)
  };
}

export async function setSession(
  sessionId: string,
  update: SessionRecord
): Promise<void> {
  const sessions = await readJsonFile<SessionMap>(FILE_NAME, {});
  const existing = sessions[sessionId] ?? {};
  const next: StoredSessionRecord = {
    ...existing,
    ...update
  };
  sessions[sessionId] = {
    ...next,
    accessToken: encryptMaybe(next.accessToken),
    refreshToken: encryptMaybe(next.refreshToken),
    codeVerifier: encryptMaybe(next.codeVerifier),
    authState: encryptMaybe(next.authState)
  };
  await writeJsonFile(FILE_NAME, sessions);
}

export async function clearSession(sessionId: string): Promise<void> {
  const sessions = await readJsonFile<SessionMap>(FILE_NAME, {});
  delete sessions[sessionId];
  await writeJsonFile(FILE_NAME, sessions);
}

export async function findSessionByAuthState(state: string): Promise<{
  sessionId: string;
  codeVerifier: string;
} | null> {
  const sessions = await readJsonFile<SessionMap>(FILE_NAME, {});
  for (const [sessionId, stored] of Object.entries(sessions)) {
    const authState = decryptMaybe(stored.authState);
    if (authState === state) {
      const codeVerifier = decryptMaybe(stored.codeVerifier);
      if (codeVerifier) {
        return { sessionId, codeVerifier };
      }
    }
  }
  return null;
}

function encryptMaybe(value?: string | EncryptedPayload) {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    return encryptSecret(value);
  }
  return value;
}

function decryptMaybe(value?: string | EncryptedPayload) {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  return decryptSecret(value);
}
