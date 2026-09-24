import { ResourceContract } from "../contract.ts";

/**
 * `gateway.v1` — an HTTP ingress that host/path-routes to `compute` targets
 * inside the workload. Implemented only on compose today, per the same
 * "second target proves the shape" discipline as every other contract here —
 * there is no aws provisioner for this Type, a deliberate gap (declaring one
 * on aws throws `NoMatchingProvisionerError`, same as `storage.volume` did
 * before it had a second target — not a bug).
 *
 * `network` names the (typically external) network the gateway joins — same
 * `${external.<name>.name}` convention `container-orchestrated.v1`'s own
 * `networks` entries use, singular here since a gateway has exactly one
 * ingress-facing network to join.
 *
 * `routes` is shallow at the contract level (`type: "array"`), same
 * treatment as `container-orchestrated.v1`'s `mounts`/`development`: the
 * per-entry shape — `{ host, path, target: { service, port } }`, `path`
 * either a plain prefix string or `{ match, strip }`, `target.port` normally
 * a `${compute.<name>.<port>}` reference — is a provisioner-owned
 * convention, not validated here. `target` is split into `service` (a plain
 * compute name, never itself a reference) and `port` deliberately, rather
 * than one combined reference: `${compute.<name>.<port>}` always bakes to a
 * bare port number (Section 8 — a compute's ports are developer-declared
 * data, never a provisioner output), which alone can't tell a provisioner
 * which compute to route to. Naming the compute separately gives the
 * provisioner both pieces it needs without inventing a new reference shape
 * that would only ever resolve to a compound value nowhere else in the
 * grammar does.
 *
 * `tls` names the certificate strategy. `internal` is implemented on
 * compose: Caddy mints and rotates its own local CA and leaf certs, so the
 * gateway serves HTTPS (on host port 8443) with nothing to configure beyond
 * that one directive. Any other value is accepted but not rendered — an
 * ACME/public pipeline is a genuine feature nobody has asked for yet, so it
 * isn't invented ahead of that need — and an unset `tls` keeps the plain-HTTP
 * gateway it has always been.
 */
export const gatewayV1: ResourceContract = new ResourceContract(
  "networking",
  "gateway",
  "v1",
  [
    { name: "network", required: true, type: "string" },
    { name: "routes", required: true, type: "array" },
    { name: "tls", required: false, type: "string" },
  ],
  [],
  [],
  [],
);
