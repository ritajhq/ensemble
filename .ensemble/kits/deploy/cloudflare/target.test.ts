import { assertEquals, assertThrows } from "@std/assert";
import { itemsTable } from "./schema.ts";
import { bucketUrl, targetOf } from "./target.ts";

Deno.test("targetOf: the account by default, this machine when asked", () => {
  assertEquals(targetOf({ CLOUDFLARE_ACCOUNT_ID: "acc" }), {
    kind: "remote",
    accountId: "acc",
  });
  assertEquals(targetOf({ ENS_CLOUDFLARE_TARGET: "local" }), {
    kind: "local",
    port: 8787,
  });
  assertEquals(
    targetOf({ ENS_CLOUDFLARE_TARGET: "local", ENS_CLOUDFLARE_PORT: "9000" }),
    { kind: "local", port: 9000 },
  );
  assertThrows(() => targetOf({}), Error, "CLOUDFLARE_ACCOUNT_ID");
  assertThrows(
    () => targetOf({ ENS_CLOUDFLARE_TARGET: "staging" }),
    Error,
    '"local" or "remote"',
  );
  assertThrows(
    () =>
      targetOf({ ENS_CLOUDFLARE_TARGET: "local", ENS_CLOUDFLARE_PORT: "http" }),
    Error,
    "port number",
  );
});

Deno.test("bucketUrl: R2's endpoint for the account, or the local stand-in on the runtime's own port", () => {
  assertEquals(
    bucketUrl({ kind: "remote", accountId: "acc" }, "files"),
    "https://acc.r2.cloudflarestorage.com/files",
  );
  assertEquals(
    bucketUrl({ kind: "local", port: 8787 }, "files"),
    "http://localhost:8787/cdn-cgi/local/r2/s3/files",
  );
});

Deno.test("itemsTable: the key attributes as the primary key, everything else in attributes", () => {
  assertEquals(
    itemsTable({ partition: "PK", sort: "SK" }),
    `CREATE TABLE IF NOT EXISTS items ("PK" TEXT NOT NULL, "SK" TEXT NOT NULL, attributes TEXT NOT NULL, PRIMARY KEY ("PK", "SK"))`,
  );
  assertEquals(
    itemsTable({ partition: "id" }),
    `CREATE TABLE IF NOT EXISTS items ("id" TEXT NOT NULL, attributes TEXT NOT NULL, PRIMARY KEY ("id"))`,
  );
});
