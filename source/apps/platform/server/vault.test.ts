import { assertEquals, assertNotEquals, assertRejects } from "@std/assert";
import { InvalidKeyError, Vault } from "./vault.ts";

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

Deno.test("Vault: a sealed secret opens to what was sealed, and never reads as it", async () => {
  const vault = await Vault.of(KEY);
  const sealed = await vault.seal("hunter2", ["env-1", "db-password"]);
  assertNotEquals(atob(sealed.data).includes("hunter2"), true);
  assertEquals(await vault.open(sealed, ["env-1", "db-password"]), "hunter2");
});

Deno.test("Vault: a secret moved under another environment doesn't open", async () => {
  const vault = await Vault.of(KEY);
  const sealed = await vault.seal("hunter2", ["env-1", "db-password"]);
  await assertRejects(() => vault.open(sealed, ["env-2", "db-password"]));
});

Deno.test("Vault: a key must be 32 bytes", async () => {
  await assertRejects(() => Vault.of(btoa("short")), InvalidKeyError);
});
