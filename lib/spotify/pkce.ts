import { createHash, randomBytes } from "crypto";

function toBase64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function generateOAuthState(): string {
  return toBase64Url(randomBytes(24));
}

export function generateCodeVerifier(): string {
  return toBase64Url(randomBytes(64));
}

export function generateCodeChallenge(codeVerifier: string): string {
  return toBase64Url(createHash("sha256").update(codeVerifier).digest());
}
