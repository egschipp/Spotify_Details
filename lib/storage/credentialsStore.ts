import { decryptSecret, encryptSecret, EncryptedPayload } from "./encryption";
import { readJsonFile, writeJsonFile } from "./storageUtils";

export type StoredCredentials = {
  clientId: string;
  secret: EncryptedPayload;
  updatedAt: string;
};

type CredentialMap = Record<string, StoredCredentials>;

const FILE_NAME = "credentials.json";

export async function saveCredentials(
  sessionId: string,
  clientId: string,
  clientSecret: string
): Promise<void> {
  const credentials = await readJsonFile<CredentialMap>(FILE_NAME, {});
  credentials[sessionId] = {
    clientId,
    secret: encryptSecret(clientSecret),
    updatedAt: new Date().toISOString()
  };
  await writeJsonFile(FILE_NAME, credentials);
}

export async function getCredentials(
  sessionId: string
): Promise<{ clientId: string; clientSecret: string } | null> {
  const credentials = await readJsonFile<CredentialMap>(FILE_NAME, {});
  const entry = credentials[sessionId];
  if (!entry) {
    return null;
  }
  return {
    clientId: entry.clientId,
    clientSecret: decryptSecret(entry.secret)
  };
}

export async function getCredentialStatus(sessionId: string): Promise<{
  hasCredentials: boolean;
  clientId?: string;
}> {
  const credentials = await readJsonFile<CredentialMap>(FILE_NAME, {});
  const entry = credentials[sessionId];
  if (!entry) {
    return { hasCredentials: false };
  }
  return { hasCredentials: true, clientId: entry.clientId };
}

export async function clearCredentials(sessionId: string): Promise<void> {
  const credentials = await readJsonFile<CredentialMap>(FILE_NAME, {});
  delete credentials[sessionId];
  await writeJsonFile(FILE_NAME, credentials);
}
