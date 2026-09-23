/**
 * Garage's `rpc_secret` (a 64-hex-char shared secret authenticating node-to-
 * node RPC) has no portable meaning outside this single-node instance — a
 * one-node "cluster" never has a second node to authenticate against, so
 * there's nothing sensitive riding on this value the way a real credential
 * would be. Deriving it deterministically from the resource's own name
 * (rather than a fresh random value per render) is what keeps rendering the
 * same workload twice byte-identical (G5) — a `crypto.randomUUID()` here
 * would fail that on the very next render.
 */
async function deriveRpcSecret(resourceName: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`garage-rpc-secret:${resourceName}`),
  );
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * A minimal single-node Garage config: sqlite metadata (no separate DB
 * process to run), one replica (there's only ever one node), and the S3 API
 * on `3900` — the port `object-storage.v1`'s compose `url` output points at.
 * No `[admin]` section: `bootstrapScript` below drives the `garage` binary
 * locally inside the same container rather than over the admin HTTP API, so
 * there's no separate admin token to manage.
 */
export async function garageToml(resourceName: string): Promise<string> {
  const rpcSecret = await deriveRpcSecret(resourceName);
  return `metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"

replication_factor = 1

rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "${rpcSecret}"

[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"
root_domain = ".s3.garage.localhost"
`;
}

/**
 * Garage has no declarative "create this bucket/key on boot" config of its
 * own (unlike postgres's `docker-entrypoint-initdb.d`, Garage's layout/
 * bucket/key state is only ever set through its own CLI) — so the container
 * runs the real server in the background and drives that CLI against it
 * once it's up, then waits on the server so the container's lifetime still
 * matches the server's. `|| true` after every already-applied step (layout
 * assign/apply, key import, bucket create/allow) makes a container restart
 * idempotent rather than crash-looping on "already done" errors — the
 * concrete tradeoff is that a genuine failure in one of these steps is
 * swallowed the same way; a real Garage deployment beyond this single-node,
 * first-boot case would need a less blunt check than "did this exit
 * nonzero."
 */
export function garageBootstrapScript(): string {
  return `#!/bin/sh
set -e
/garage server &
SERVER_PID=$!

until /garage status >/dev/null 2>&1; do
  sleep 1
done

NODE_ID=$(/garage node id -q)
/garage layout assign -z dc1 -c 1G "$NODE_ID" || true
/garage layout apply --version 1 || true

/garage key import "$ACCESS_KEY" "$SECRET_KEY" --name app-key || true
/garage bucket create "$BUCKET" || true
/garage bucket allow --read --write "$BUCKET" --key app-key || true

wait "$SERVER_PID"
`;
}
