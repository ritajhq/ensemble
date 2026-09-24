import { assertEquals, assertMatch } from "@std/assert";
import * as KitSdk from "@ensemble/kit-sdk";
import { garageSeedScript, garageToml } from "./garage-config.ts";

const SEED_PARAMS = {
  service: "bucket",
  bucket: "my-bucket",
  accessKey: "${S3_ACCESS_KEY}",
  secretKey: "${S3_SECRET_KEY}",
};

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

Deno.test("garageSeedScript: drives Garage from the host through the deployment's own compose project, never from inside the container (the image is scratch: no shell to run a script with)", () => {
  const script = garageSeedScript(SEED_PARAMS);

  assertMatch(
    script,
    /compose\(\) \{ docker compose -f "\$ENS_ARTIFACT_PATH" -p "\$ENS_DEPLOYMENT_NAME" "\$@"; \}/,
  );
  assertMatch(
    script,
    /garage\(\) \{ compose exec -T bucket \/garage "\$@"; \}/,
  );
  assertEquals(script.includes("/bin/sh"), false);
  assertEquals(script.includes("/bootstrap.sh"), false);
});

Deno.test("garageSeedScript: takes the artifact it acts on and the project it belongs to from the core's own env, never a hardcoded deployment name", () => {
  const script = garageSeedScript(SEED_PARAMS);

  assertMatch(
    script,
    new RegExp(`"\\$${KitSdk.Deploy.Render.INIT_COMMAND_ENV.artifactPath}"`),
  );
  assertMatch(
    script,
    new RegExp(`"\\$${KitSdk.Deploy.Render.INIT_COMMAND_ENV.deploymentName}"`),
  );
});

Deno.test("garageSeedScript: polls until Garage answers, with a bounded wait rather than an unbounded one", () => {
  const script = garageSeedScript(SEED_PARAMS);

  assertMatch(script, /until garage status >\/dev\/null 2>&1; do/);
  assertMatch(script, /if \[ "\$attempt" -ge 60 \]; then/);
});

Deno.test("garageSeedScript: assigns a single-node layout, imports the given credentials, and creates/allows the bucket", () => {
  const script = garageSeedScript(SEED_PARAMS);

  assertMatch(
    script,
    /NODE_ID=\$\(garage node id -q 2>\/dev\/null \| tail -1 \| cut -d@ -f1\)/,
  );
  assertMatch(script, /garage layout assign -z dc1 -c 1G "\$NODE_ID"/);
  assertMatch(
    script,
    /VERSION=\$\(garage layout show 2>\/dev\/null \| grep -oE 'version \[0-9\]\+' \| tail -1 \| grep -oE '\[0-9\]\+'\)/,
  );
  assertMatch(script, /garage layout apply --version "\$VERSION"/);
  assertMatch(
    script,
    /garage key import "\$\{S3_ACCESS_KEY\}" "\$\{S3_SECRET_KEY\}" -n app-key --yes/,
  );
  assertMatch(script, /garage bucket create "my-bucket"/);
  assertMatch(
    script,
    /garage bucket allow --read --write --owner "my-bucket" --key app-key/,
  );
});

Deno.test("garageSeedScript: names the imported key with -n, the flag Garage v1 actually has (it has no --name)", () => {
  const script = garageSeedScript(SEED_PARAMS);

  assertEquals(script.includes("--name"), false);
  assertMatch(script, /key import .* -n app-key --yes/);
});

Deno.test("garageSeedScript: only touches layout when no role is assigned yet (idempotent restart)", () => {
  const script = garageSeedScript(SEED_PARAMS);

  assertMatch(
    script,
    /if garage status 2>&1 \| grep -q "NO ROLE ASSIGNED"; then/,
  );
});

Deno.test("garageSeedScript: key/bucket steps are precise idempotency checks, not blanket suppression", () => {
  const script = garageSeedScript(SEED_PARAMS);

  assertEquals(script.includes("|| true"), false);
  assertMatch(
    script,
    /garage key list 2>\/dev\/null \| grep -q "app-key" \|\|/,
  );
  assertMatch(
    script,
    /garage bucket list 2>\/dev\/null \| grep -qE "\(\^\| \)my-bucket\( \|\$\)" \|\|/,
  );
});

Deno.test("garageSeedScript: renders the caller's own service, bucket, and credential tokens, never Garage's own defaults", () => {
  const script = garageSeedScript({
    service: "backups",
    bucket: "archive",
    accessKey: "${ARCHIVE_ACCESS_KEY}",
    secretKey: "${ARCHIVE_SECRET_KEY}",
  });

  assertMatch(script, /compose exec -T backups \/garage/);
  assertMatch(script, /garage bucket create "archive"/);
  assertMatch(script, /garage key import "\$\{ARCHIVE_ACCESS_KEY\}"/);
  assertEquals(script.includes("my-bucket"), false);
});
