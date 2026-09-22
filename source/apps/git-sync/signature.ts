const SIGNATURE_PREFIX = "sha256=";

/** Verifies a GitHub `X-Hub-Signature-256` header against the raw request body and the target's own webhook secret. Constant-time compare so a partial match can't leak timing signal about the valid signature. */
export async function verifySignature(
  secret: string,
  rawBody: Uint8Array<ArrayBuffer>,
  header: string | null,
): Promise<boolean> {
  if (!header || !header.startsWith(SIGNATURE_PREFIX)) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, rawBody);
  const expected = toHex(new Uint8Array(digest));
  const actual = header.slice(SIGNATURE_PREFIX.length);

  return timingSafeEqual(expected, actual);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
