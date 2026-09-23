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
 * matches the server's.
 *
 * The layout/bucket/key steps below are ported from `ritajhq/portal`'s own
 * pre-existing `ci/scripts/garage-bootstrap.sh` — a separately-run,
 * already-proven script (it predates this contract; portal ran it by hand
 * via `docker exec` after every deploy) — rather than written from scratch,
 * after portal's version turned up two real mistakes in an earlier draft of
 * this one: `garage node id -q` prints `<pubkey>@<address>`, and `layout
 * assign` wants only the pubkey half (`cut -d@ -f1`); and the version
 * `layout apply` takes is Garage's own suggested next version from `layout
 * show`, never a hardcoded `1` (portal's own comment: "don't add 1, or
 * Garage rejects it"). Every idempotency check here is an explicit "does
 * this already exist" test (`list | grep`), same as portal's script, rather
 * than a blanket `|| true` — the latter would just as happily swallow a real
 * failure as a harmless "already done" one. `SERVER_PID`'s trap forwards a
 * container stop signal to the backgrounded server for a clean shutdown,
 * which a bare `wait` alone does not do.
 */
export function garageBootstrapScript(): string {
  return `#!/bin/sh
set -e
/garage server &
SERVER_PID=$!
trap 'kill -TERM "$SERVER_PID" 2>/dev/null' TERM INT

until /garage status >/dev/null 2>&1; do
  sleep 1
done

if /garage status 2>&1 | grep -q "NO ROLE ASSIGNED"; then
  NODE_ID=$(/garage node id -q 2>/dev/null | tail -1 | cut -d@ -f1)
  /garage layout assign -z dc1 -c 1G "$NODE_ID"
  # Garage's own suggested next version from \`layout show\` — never a
  # hardcoded/incremented guess, or Garage rejects the apply.
  VERSION=$(/garage layout show 2>/dev/null | grep -oE 'version [0-9]+' | tail -1 | grep -oE '[0-9]+')
  /garage layout apply --version "$VERSION"
fi

/garage key list 2>/dev/null | grep -q "app-key" || /garage key import "$ACCESS_KEY" "$SECRET_KEY" --name app-key
/garage bucket list 2>/dev/null | grep -qE "(^| )$BUCKET( |$)" || /garage bucket create "$BUCKET"
/garage bucket allow --read --write --owner "$BUCKET" --key app-key

wait "$SERVER_PID"
`;
}
