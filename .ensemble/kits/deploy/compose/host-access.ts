import * as KitSdk from "@ensemble/kit-sdk";

/**
 * The `ports:` a service publishes so a developer can reach it from the host
 * — psql against a database, an S3 client against a bucket, curl or a
 * debugger against a compute — only when `ens develop` brought the stack up.
 * `ens deploy` publishes nothing here: the gateway's ingress is the only way
 * in, and the same topology runs in both modes; this only adds to it.
 *
 * Each container port maps to an *ephemeral* host port, never the same
 * number: the host's port space is shared by every local stack, and computes
 * in one stack routinely share a container port (every frontend here listens
 * on 8000). `docker compose port <service> <container port>` finds it.
 */
export function hostAccess(
  request: KitSdk.Deploy.ResolvedRequest,
  containerPorts: readonly number[],
): { ports?: string[] } {
  if (request.mode !== "development") return {};
  if (containerPorts.length === 0) return {};
  return { ports: containerPorts.map(String) };
}
