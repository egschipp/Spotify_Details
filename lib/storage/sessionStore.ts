import { readJsonFile, writeJsonFile } from "./storageUtils";

export type SessionRecord = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  codeVerifier?: string;
  authState?: string;
};

type SessionMap = Record<string, SessionRecord>;

const FILE_NAME = "sessions.json";

export async function getSession(sessionId: string): Promise<SessionRecord> {
  const sessions = await readJsonFile<SessionMap>(FILE_NAME, {});
  return sessions[sessionId] ?? {};
}

export async function setSession(
  sessionId: string,
  update: SessionRecord
): Promise<void> {
  const sessions = await readJsonFile<SessionMap>(FILE_NAME, {});
  sessions[sessionId] = {
    ...sessions[sessionId],
    ...update
  };
  await writeJsonFile(FILE_NAME, sessions);
}

export async function clearSession(sessionId: string): Promise<void> {
  const sessions = await readJsonFile<SessionMap>(FILE_NAME, {});
  delete sessions[sessionId];
  await writeJsonFile(FILE_NAME, sessions);
}
