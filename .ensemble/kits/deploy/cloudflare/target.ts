import type { Target } from "./plan.ts";

/**
 * Which Cloudflare a deployment lands in — the environment's choice, never
 * the manifest's, as `AWS_ENDPOINT_URL` is for the aws kit:
 *
 * - `ENS_CLOUDFLARE_TARGET=local` runs it all on this machine, in the
 *   Workers runtime itself (`wrangler dev`: workerd, with D1 and R2 kept on
 *   disk) on `ENS_CLOUDFLARE_PORT` (8787 by default). A local runtime lives
 *   only as long as the process running it, so only `ens develop` can bring
 *   it up.
 * - otherwise it's the account `CLOUDFLARE_ACCOUNT_ID` names, reached with
 *   `CLOUDFLARE_API_TOKEN` (wrangler's own variables).
 */
export const TARGET = "ENS_CLOUDFLARE_TARGET";
export const PORT = "ENS_CLOUDFLARE_PORT";
export const ACCOUNT_ID = "CLOUDFLARE_ACCOUNT_ID";
const DEFAULT_PORT = 8787;

export function targetOf(
  env: Readonly<Record<string, string | undefined>>,
): Target {
  if (env[TARGET] === "local") {
    return { kind: "local", port: portOf(env[PORT]) };
  }
  if (env[TARGET] !== undefined && env[TARGET] !== "remote") {
    throw new Error(
      `${TARGET} must be "local" or "remote", not "${env[TARGET]}".`,
    );
  }
  const accountId = env[ACCOUNT_ID];
  if (!accountId) {
    throw new Error(
      `Set ${ACCOUNT_ID} to the account to deploy to — or ${TARGET}=local to run it on this machine.`,
    );
  }
  return { kind: "remote", accountId };
}

/** A bucket's S3 API: R2's own endpoint for the account, or the local runtime's stand-in for it. */
export function bucketUrl(target: Target, bucket: string): string {
  if (target.kind === "remote") {
    return `https://${target.accountId}.r2.cloudflarestorage.com/${bucket}`;
  }
  return `http://localhost:${target.port}/cdn-cgi/local/r2/s3/${bucket}`;
}

function portOf(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${PORT} must be a port number, not "${raw}".`);
  }
  return port;
}
