import { timingSafeEqual } from "@std/crypto/timing-safe-equal";

async function computeSignature(secret: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256=${hex}`;
}

/**
 * Verifies GitHub's `X-Hub-Signature-256` header against the raw request
 * body, using a constant-time comparison so response timing can't leak the
 * secret. `secret` is read from GITHUB_WEBHOOK_SECRET by the caller — if
 * that env var isn't set, the caller skips verification entirely (a
 * deliberate v1 relaxation matching the platform's "no auth for v1" stance).
 */
export async function verifyGithubSignature(
  secret: string,
  rawBody: string,
  header: string | null,
): Promise<boolean> {
  if (!header) return false;
  const expected = await computeSignature(secret, rawBody);
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(header);
  return a.length === b.length && timingSafeEqual(a, b);
}
