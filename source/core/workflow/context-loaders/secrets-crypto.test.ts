import { assertEquals, assertRejects } from "@std/assert";
import {
  decryptFile,
  decryptValue,
  encryptFile,
  encryptValue,
  generateKeypair,
  isEncryptedMarker,
} from "./secrets-crypto.ts";

Deno.test("generateKeypair: produces a usable privateKey/publicKey pair", async () => {
  const keypair = await generateKeypair();
  assertEquals(typeof keypair.privateKey, "string");
  assertEquals(typeof keypair.publicKey, "string");
  assertEquals(keypair.privateKey.length > 0, true);
  assertEquals(keypair.publicKey.length > 0, true);
});

Deno.test("generateKeypair: two calls produce different keys", async () => {
  const a = await generateKeypair();
  const b = await generateKeypair();
  assertEquals(a.privateKey === b.privateKey, false);
  assertEquals(a.publicKey === b.publicKey, false);
});

Deno.test("encryptValue/decryptValue: round-trips a plaintext value", async () => {
  const { privateKey, publicKey } = await generateKeypair();
  const marker = await encryptValue(publicKey, "hunter2");
  assertEquals(await decryptValue(privateKey, marker), "hunter2");
});

Deno.test("encryptValue: produces the ENC[X25519,...] marker format", async () => {
  const { publicKey } = await generateKeypair();
  const marker = await encryptValue(publicKey, "hunter2");
  assertEquals(marker.startsWith("ENC[X25519,epk:"), true);
  assertEquals(marker.endsWith("]"), true);
  assertEquals(marker.includes(",data:"), true);
  assertEquals(marker.includes(",iv:"), true);
});

Deno.test("encryptValue: never contains the plaintext value", async () => {
  const { publicKey } = await generateKeypair();
  const marker = await encryptValue(publicKey, "hunter2");
  assertEquals(marker.includes("hunter2"), false);
});

Deno.test("encryptValue: two encryptions of the same plaintext produce different markers (fresh ephemeral key + IV each time)", async () => {
  const { publicKey } = await generateKeypair();
  const first = await encryptValue(publicKey, "hunter2");
  const second = await encryptValue(publicKey, "hunter2");
  assertEquals(first === second, false);
});

Deno.test("decryptValue: fails with the wrong private key", async () => {
  const recipient = await generateKeypair();
  const attacker = await generateKeypair();
  const marker = await encryptValue(recipient.publicKey, "hunter2");
  await assertRejects(
    () => decryptValue(attacker.privateKey, marker),
    Error,
    "decrypt",
  );
});

Deno.test("decryptValue: fails on tampered ciphertext (flipped byte)", async () => {
  const { privateKey, publicKey } = await generateKeypair();
  const marker = await encryptValue(publicKey, "hunter2");
  const tampered = marker.replace(",data:", ",data:X");
  await assertRejects(() => decryptValue(privateKey, tampered), Error);
});

Deno.test("decryptValue: fails on a malformed marker", async () => {
  const { privateKey } = await generateKeypair();
  await assertRejects(
    () => decryptValue(privateKey, "not-a-marker"),
    Error,
    "Not a valid ENC",
  );
});

Deno.test("encryptFile/decryptFile: round-trips arbitrary bytes", async () => {
  const { privateKey, publicKey } = await generateKeypair();
  const original = new TextEncoder().encode(
    "-----BEGIN PRIVATE KEY-----\nfake cert bytes\n-----END PRIVATE KEY-----",
  );
  const encrypted = await encryptFile(publicKey, original);
  const decrypted = await decryptFile(privateKey, encrypted);
  assertEquals(decrypted, original);
});

Deno.test("encryptFile: output never contains the plaintext bytes as a substring", async () => {
  const { publicKey } = await generateKeypair();
  const original = new TextEncoder().encode("super-secret-cert-content");
  const encrypted = await encryptFile(publicKey, original);
  const encryptedText = Array.from(encrypted).join(",");
  const originalText = Array.from(original).join(",");
  assertEquals(encryptedText.includes(originalText), false);
});

Deno.test("decryptFile: fails with the wrong private key", async () => {
  const recipient = await generateKeypair();
  const attacker = await generateKeypair();
  const encrypted = await encryptFile(
    recipient.publicKey,
    new TextEncoder().encode("secret bytes"),
  );
  await assertRejects(
    () => decryptFile(attacker.privateKey, encrypted),
    Error,
    "decrypt",
  );
});

Deno.test("decryptFile: fails on truncated/corrupted input", async () => {
  const { privateKey } = await generateKeypair();
  await assertRejects(
    () => decryptFile(privateKey, new Uint8Array([1, 2, 3])),
    Error,
    "too short",
  );
});

Deno.test("isEncryptedMarker: true for an actual marker, false for plaintext", async () => {
  const { publicKey } = await generateKeypair();
  const marker = await encryptValue(publicKey, "hunter2");
  assertEquals(isEncryptedMarker(marker), true);
  assertEquals(isEncryptedMarker("plain-value"), false);
  assertEquals(isEncryptedMarker(""), false);
});
