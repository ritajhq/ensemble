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
  assertMatch(
    script,
    /NODE_ID=\$\(\/garage node id -q 2>\/dev\/null \| tail -1 \| cut -d@ -f1\)/,
  );
  assertMatch(script, /\/garage layout assign -z dc1 -c 1G "\$NODE_ID"/);
  assertMatch(
    script,
    /VERSION=\$\(\/garage layout show 2>\/dev\/null \| grep -oE 'version \[0-9\]\+' \| tail -1 \| grep -oE '\[0-9\]\+'\)/,
  );
  assertMatch(script, /\/garage layout apply --version "\$VERSION"/);
  assertMatch(script, /\/garage key import "\$ACCESS_KEY" "\$SECRET_KEY"/);
  assertMatch(script, /\/garage bucket create "\$BUCKET"/);
  assertMatch(
    script,
    /\/garage bucket allow --read --write --owner "\$BUCKET" --key app-key/,
  );
});

Deno.test("garageBootstrapScript: only touches layout when no role is assigned yet (idempotent restart)", () => {
  const script = garageBootstrapScript();
  assertMatch(
    script,
    /if \/garage status 2>&1 \| grep -q "NO ROLE ASSIGNED"; then/,
  );
});

Deno.test("garageBootstrapScript: key/bucket steps are precise idempotency checks, not blanket suppression", () => {
  const script = garageBootstrapScript();
  assertEquals(script.includes("|| true"), false);
  assertMatch(
    script,
    /\/garage key list 2>\/dev\/null \| grep -q "app-key" \|\|/,
  );
  assertMatch(
    script,
    /\/garage bucket list 2>\/dev\/null \| grep -qE "\(\^\| \)\$BUCKET\( \|\$\)" \|\|/,
  );
});

Deno.test("garageBootstrapScript: forwards a stop signal to the backgrounded server for clean shutdown", () => {
  const script = garageBootstrapScript();
  assertMatch(
    script,
    /trap 'kill -TERM "\$SERVER_PID" 2>\/dev\/null' TERM INT/,
  );
});
