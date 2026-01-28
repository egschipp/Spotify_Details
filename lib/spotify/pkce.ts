import crypto from "crypto";

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function generateCodeVerifier(): string {
  return toBase64Url(crypto.randomBytes(64));
}

export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return toBase64Url(hash);
}
