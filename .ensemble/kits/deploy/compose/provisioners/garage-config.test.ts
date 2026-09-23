import { assertEquals, assertMatch } from "@std/assert";
import { garageBootstrapScript, garageToml } from "./garage-config.ts";

Deno.test("garageToml: derives a 64-hex-char rpc_secret deterministically from the resource's own name (G5: same input, same output)", async () => {
  const first = await garageToml("bucket");
  const second = await garageToml("bucket");
  assertEquals(first, second);

  const match = first.match(/rpc_secret = "([0-9a-f]+)"/);
  assertEquals(match?.[1]?.length, 64);
});

Deno.test("garageToml: two different resource names derive two different rpc_secrets", async () => {
  const a = await garageToml("bucket-a");
  const b = await garageToml("bucket-b");
  assertEquals(a === b, false);
});

Deno.test("garageToml: single-node config with the S3 API on 3900 and no admin section", async () => {
  const toml = await garageToml("bucket");
  assertMatch(toml, /replication_factor = 1/);
  assertMatch(toml, /api_bind_addr = "\[::\]:3900"/);
  assertEquals(toml.includes("[admin]"), false);
});

Deno.test("garageBootstrapScript: assigns a single-node layout, imports the given credentials, and creates/allows the bucket", () => {
  const script = garageBootstrapScript();
  assertMatch(script, /\/garage server &/);
  assertMatch(script, /\/garage layout assign -z dc1 -c 1G "\$NODE_ID"/);
  assertMatch(script, /\/garage key import "\$ACCESS_KEY" "\$SECRET_KEY"/);
  assertMatch(script, /\/garage bucket create "\$BUCKET"/);
  assertMatch(script, /\/garage bucket allow --read --write "\$BUCKET"/);
});
