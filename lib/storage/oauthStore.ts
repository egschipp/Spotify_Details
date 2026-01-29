import crypto from "crypto";
import { decryptSecret, encryptSecret, EncryptedPayload } from "./encryption";
import { readJsonFile, writeJsonFile } from "./storageUtils";

type OAuthRecord = {
  state: string;
  codeVerifier: EncryptedPayload;
  clientId: string;
  clientSecret: EncryptedPayload;
  createdAt: number;
};

type OAuthMap = Record<string, OAuthRecord>;

const FILE_NAME = "oauth.json";
const TTL_MS = 10 * 60 * 1000;

function pruneExpired(records: OAuthMap) {
  const cutoff = Date.now() - TTL_MS;
  let changed = false;
  for (const [nonce, record] of Object.entries(records)) {
    if (record.createdAt < cutoff) {
      delete records[nonce];
      changed = true;
    }
  }
  return changed;
}

export async function createOAuthRecord(params: {
  state: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const records = await readJsonFile<OAuthMap>(FILE_NAME, {});
  const nonce = crypto.randomUUID();
  records[nonce] = {
    state: params.state,
    codeVerifier: encryptSecret(params.codeVerifier),
    clientId: params.clientId,
    clientSecret: encryptSecret(params.clientSecret),
    createdAt: Date.now()
  };
  await writeJsonFile(FILE_NAME, records);
  return nonce;
}

export async function getOAuthRecord(nonce: string): Promise<{
  state: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
} | null> {
  const records = await readJsonFile<OAuthMap>(FILE_NAME, {});
  const changed = pruneExpired(records);
  if (changed) {
    await writeJsonFile(FILE_NAME, records);
  }
  const record = records[nonce];
  if (!record) {
    return null;
  }
  return {
    state: record.state,
    codeVerifier: decryptSecret(record.codeVerifier),
    clientId: record.clientId,
    clientSecret: decryptSecret(record.clientSecret)
  };
}

export async function findOAuthRecordByState(state: string): Promise<{
  nonce: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
} | null> {
  const records = await readJsonFile<OAuthMap>(FILE_NAME, {});
  const changed = pruneExpired(records);
  if (changed) {
    await writeJsonFile(FILE_NAME, records);
  }
  for (const [nonce, record] of Object.entries(records)) {
    if (record.state === state) {
      return {
        nonce,
        codeVerifier: decryptSecret(record.codeVerifier),
        clientId: record.clientId,
        clientSecret: decryptSecret(record.clientSecret)
      };
    }
  }
  return null;
}

export async function clearOAuthRecord(nonce: string): Promise<void> {
  const records = await readJsonFile<OAuthMap>(FILE_NAME, {});
  if (records[nonce]) {
    delete records[nonce];
    await writeJsonFile(FILE_NAME, records);
  }
}
