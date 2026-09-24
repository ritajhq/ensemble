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
 * The seeding Garage can't do for itself: its own CLI is the only way to
 * assign a single-node layout and create the bucket/key, and the official
 * image is `scratch` — no shell, no `grep`/`cut`/`tail`, nothing — so there is
 * no script that could run *inside* that container to drive it. The shell
 * therefore lives on the host, driving the container the apply already
 * started, exactly the `docker exec <container> /garage …` shape portal's
 * pre-ens `ci/scripts/garage-bootstrap.sh` proved out (this is that script,
 * ported — it ran the same CLI by hand after every deploy).
 *
 * Idempotent by construction, since the core re-runs it on every apply: the
 * layout is only touched while Garage still reports `NO ROLE ASSIGNED`, and
 * the key/bucket steps are explicit "does this already exist" tests rather
 * than a blanket `|| true`, which would swallow a real failure just as
 * happily as a harmless "already done".
 *
 * `accessKey`/`secretKey` are the same `${VAR}` interpolation tokens
 * `composeSecretWiring` puts in the compose document — which are valid shell
 * references too, resolved from the very environment `docker compose` itself
 * interpolates them from, so a credential is never copied into this script's
 * text.
 *
 * `$ENS_ARTIFACT_PATH`/`$ENS_DEPLOYMENT_NAME` are the core's own
 * (`INIT_COMMAND_ENV`): the artifact it applied and the deployment name that
 * artifact is scoped by, which is what lets this address this deployment's
 * compose project rather than a hardcoded one.
 */
export function garageSeedScript(params: {
  service: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}): string {
  const { service, bucket, accessKey, secretKey } = params;
  return `set -eu

compose() { docker compose -f "$ENS_ARTIFACT_PATH" -p "$ENS_DEPLOYMENT_NAME" "$@"; }
garage() { compose exec -T ${service} /garage "$@"; }

# The apply already ran, so the container exists — but Garage's own server may
# still be coming up. Poll instead of guessing at a sleep.
attempt=0
until garage status >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "${service}: Garage did not answer within 60s." >&2
    exit 1
  fi
  sleep 1
done

if garage status 2>&1 | grep -q "NO ROLE ASSIGNED"; then
  NODE_ID=$(garage node id -q 2>/dev/null | tail -1 | cut -d@ -f1)
  garage layout assign -z dc1 -c 1G "$NODE_ID" >&2
  # Garage's own suggested next version from \`layout show\` — never a
  # hardcoded/incremented guess, or Garage rejects the apply.
  VERSION=$(garage layout show 2>/dev/null | grep -oE 'version [0-9]+' | tail -1 | grep -oE '[0-9]+')
  garage layout apply --version "$VERSION" >&2
fi

garage key list 2>/dev/null | grep -q "app-key" || garage key import "${accessKey}" "${secretKey}" -n app-key --yes >&2
garage bucket list 2>/dev/null | grep -qE "(^| )${bucket}( |\$)" || garage bucket create "${bucket}" >&2
garage bucket allow --read --write --owner "${bucket}" --key app-key >&2
`;
}
