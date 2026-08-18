/**
 * Age-style hybrid envelope encryption: X25519 for key agreement,
 * AES-256-GCM for the actual value/file, so a process holding only the
 * *public* key (the dashboard server, encrypting a new secret on save) can
 * never decrypt a value back — only a process holding the *private* key (the
 * CLI locally, or a workflow run via ENSEMBLE_SECRETS_KEY) can. Every
 * encryption generates a fresh ephemeral X25519 keypair and derives a
 * one-time shared secret via ECDH with the recipient's public key; the
 * ephemeral public key travels alongside the ciphertext so the private-key
 * holder can rederive the same shared secret without any prior exchange.
 *
 * Verified directly against Deno's Web Crypto before writing this: X25519
 * keygen/deriveBits both work; private keys export/import via "pkcs8" (not
 * "raw" — raw only works for the public key); public keys export/import via
 * "raw".
 */

const CURVE = "X25519" as const;
const IV_LENGTH = 12; // AES-GCM's recommended nonce size, in bytes.

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Explicit Uint8Array<ArrayBuffer> return type — a plain Uint8Array return here infers as Uint8Array<ArrayBufferLike>, which crypto.subtle's stricter BufferSource typing (TS's current lib.dom.d.ts) rejects at every call site. */
function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Copies `bytes` into a fresh, guaranteed-ArrayBuffer-backed Uint8Array — a caller-supplied Uint8Array (e.g. from Deno.readFile, or a public function's loosely-typed `Uint8Array` parameter) may type as Uint8Array<ArrayBufferLike>, which crypto.subtle's BufferSource typing rejects. */
function toArrayBufferBacked(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(bytes);
}

export interface SecretsKeypair {
  /** Base64 pkcs8 — never committed, never sent anywhere; only a decrypting process holds this. */
  privateKey: string;
  /** Base64 raw — safe to commit or hand to a server, since it can only encrypt. */
  publicKey: string;
}

export async function generateKeypair(): Promise<SecretsKeypair> {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: CURVE },
    true,
    ["deriveBits"],
  );
  const rawPrivate = await crypto.subtle.exportKey("pkcs8", privateKey);
  const rawPublic = await crypto.subtle.exportKey("raw", publicKey);
  return {
    privateKey: toBase64(new Uint8Array(rawPrivate)),
    publicKey: toBase64(new Uint8Array(rawPublic)),
  };
}

async function importPrivateKey(base64: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "pkcs8",
    fromBase64(base64),
    { name: CURVE },
    false,
    ["deriveBits"],
  );
}

async function importPublicKey(base64: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    fromBase64(base64),
    { name: CURVE },
    false,
    [],
  );
}

/** Derives the AES-256-GCM key both sides of one encryption agree on: ECDH shared secret, used directly as raw key bits (no HKDF — a fresh ephemeral keypair per encryption already guarantees a unique shared secret every time, so a KDF adds no security margin here). */
async function deriveAesKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<CryptoKey> {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: CURVE, public: publicKey },
    privateKey,
    256,
  );
  return await crypto.subtle.importKey(
    "raw",
    sharedBits,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

interface EncryptedEnvelope {
  epk: string; // ephemeral public key, base64 raw
  iv: string; // base64
  data: string; // base64 ciphertext (AES-GCM's tag is appended to this by Web Crypto, not split out separately)
}

async function encryptBytes(
  recipientPublicKeyBase64: string,
  plaintext: Uint8Array,
): Promise<EncryptedEnvelope> {
  const recipientPublicKey = await importPublicKey(recipientPublicKeyBase64);
  const ephemeral = await crypto.subtle.generateKey({ name: CURVE }, true, [
    "deriveBits",
  ]);
  const aesKey = await deriveAesKey(ephemeral.privateKey, recipientPublicKey);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    toArrayBufferBacked(plaintext),
  );
  const ephemeralPublicRaw = await crypto.subtle.exportKey(
    "raw",
    ephemeral.publicKey,
  );
  return {
    epk: toBase64(new Uint8Array(ephemeralPublicRaw)),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptBytes(
  recipientPrivateKeyBase64: string,
  envelope: EncryptedEnvelope,
): Promise<Uint8Array> {
  const recipientPrivateKey = await importPrivateKey(recipientPrivateKeyBase64);
  const ephemeralPublicKey = await importPublicKey(envelope.epk);
  const aesKey = await deriveAesKey(recipientPrivateKey, ephemeralPublicKey);
  const iv = fromBase64(envelope.iv);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      fromBase64(envelope.data),
    );
    return new Uint8Array(plaintext);
  } catch {
    // AES-GCM's auth tag (appended to the ciphertext by Web Crypto) fails to
    // verify on either a wrong key or tampered/corrupted ciphertext — Web
    // Crypto reports both as an opaque OperationError, so this is
    // deliberately the one place that distinction is collapsed into a
    // single clear message rather than leaking which case it was (nothing
    // upstream can act differently on the two anyway).
    throw new Error(
      "Failed to decrypt: wrong key, or the ciphertext has been tampered with/corrupted.",
    );
  }
}

const ENC_PREFIX = "ENC[X25519,epk:";

/** Encrypts one value into the `ENC[X25519,epk:...,data:...,iv:...]` marker string stored as a secrets.yml YAML value. */
export async function encryptValue(
  publicKey: string,
  plaintext: string,
): Promise<string> {
  const envelope = await encryptBytes(
    publicKey,
    new TextEncoder().encode(plaintext),
  );
  return `${ENC_PREFIX}${envelope.epk},data:${envelope.data},iv:${envelope.iv}]`;
}

/** Inverse of encryptValue. Throws if `marker` isn't validly formatted, or decryption fails (wrong key/tampered data). */
export async function decryptValue(
  privateKey: string,
  marker: string,
): Promise<string> {
  const envelope = parseMarker(marker);
  const plaintext = await decryptBytes(privateKey, envelope);
  return new TextDecoder().decode(plaintext);
}

function parseMarker(marker: string): EncryptedEnvelope {
  if (!marker.startsWith(ENC_PREFIX) || !marker.endsWith("]")) {
    throw new Error(`Not a valid ENC[...] marker: "${marker}"`);
  }
  const body = marker.slice(ENC_PREFIX.length, -1);
  const epkEnd = body.indexOf(",data:");
  const dataEnd = body.indexOf(",iv:");
  if (epkEnd === -1 || dataEnd === -1) {
    throw new Error(`Malformed ENC[...] marker: "${marker}"`);
  }
  return {
    epk: body.slice(0, epkEnd),
    data: body.slice(epkEnd + ",data:".length, dataEnd),
    iv: body.slice(dataEnd + ",iv:".length),
  };
}

/** Whole-file encryption, for a contextSecretFile() target — no partial encryption, the entire file becomes one opaque blob. Format: 1-byte epk length, epk, iv, ciphertext — concatenated, no text encoding, since this is written straight to a `<name>.enc` file. */
export async function encryptFile(
  publicKey: string,
  bytes: Uint8Array,
): Promise<Uint8Array> {
  const envelope = await encryptBytes(publicKey, bytes);
  const epkBytes = fromBase64(envelope.epk);
  const ivBytes = fromBase64(envelope.iv);
  const dataBytes = fromBase64(envelope.data);
  if (epkBytes.length > 255) {
    throw new Error("Unexpectedly long ephemeral public key.");
  }

  const out = new Uint8Array(
    1 + epkBytes.length + ivBytes.length + dataBytes.length,
  );
  out[0] = epkBytes.length;
  out.set(epkBytes, 1);
  out.set(ivBytes, 1 + epkBytes.length);
  out.set(dataBytes, 1 + epkBytes.length + ivBytes.length);
  return out;
}

/** Inverse of encryptFile. */
export async function decryptFile(
  privateKey: string,
  bytes: Uint8Array,
): Promise<Uint8Array> {
  if (bytes.length < 1 + IV_LENGTH) {
    throw new Error("Not a valid encrypted file: too short.");
  }
  const epkLength = bytes[0];
  const epkBytes = bytes.slice(1, 1 + epkLength);
  const ivBytes = bytes.slice(1 + epkLength, 1 + epkLength + IV_LENGTH);
  const dataBytes = bytes.slice(1 + epkLength + IV_LENGTH);
  return await decryptBytes(privateKey, {
    epk: toBase64(epkBytes),
    iv: toBase64(ivBytes),
    data: toBase64(dataBytes),
  });
}

/** True if `value` looks like an encryptValue() marker — for a loader/editor to distinguish an already-encrypted value from plaintext without attempting a decrypt. */
export function isEncryptedMarker(value: string): boolean {
  return value.startsWith(ENC_PREFIX) && value.endsWith("]");
}

/** Relative to a repo root: the private key (gitignored — only a decrypting process holds this) and its public counterpart (safe to commit). */
export const SECRETS_PRIVATE_KEY_PATH = ".ensemble/secrets.key";
export const SECRETS_PUBLIC_KEY_PATH = ".ensemble/secrets.key.pub";

/**
 * Resolves the private key a decrypting process needs: `.ensemble/
 * secrets.key` locally if present, else the `ENSEMBLE_SECRETS_KEY` env var
 * (how a containerized/server-triggered run receives it — the platform
 * server forwards its own configured value in, same pattern this session's
 * earlier vault work used for ENSEMBLE_SELF_* -> ENSEMBLE_VAULT_*). Throws a
 * clear error if neither is available — called lazily, only once an actual
 * encrypted lookup needs it, so a workflow with no context.secrets/
 * contextSecretFile() references never needs a key configured at all.
 */
export async function resolvePrivateKey(repoRoot: string): Promise<string> {
  const path = `${repoRoot}/${SECRETS_PRIVATE_KEY_PATH}`;
  try {
    return (await Deno.readTextFile(path)).trim();
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  const fromEnv = Deno.env.get("ENSEMBLE_SECRETS_KEY");
  if (fromEnv) return fromEnv;
  throw new Error(
    `No secrets private key found — expected ${path} or the ENSEMBLE_SECRETS_KEY env var. Run "ens workflow secrets init" to generate one.`,
  );
}
