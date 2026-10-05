import { ResourceContract } from "../contract.ts";

/**
 * `gateway.v1` — an HTTP ingress that host/path-routes to `compute` targets
 * inside the workload. Implemented only on compose today, per the same
 * "second target proves the shape" discipline as every other contract here —
 * there is no aws provisioner for this Type, a deliberate gap (declaring one
 * on aws throws `NoMatchingProvisionerError`, same as `storage.volume` did
 * before it had a second target — not a bug).
 *
 * `networks` names the ingress networks something in front of the gateway
 * reaches it through — same `${external.<name>.name}` convention
 * `container-orchestrated.v1`'s own `networks` entries use, or a whole
 * `${variables.<name>.value}` of a `type: list` variable so each environment
 * picks its own. None (absent or empty) means nothing fronts the gateway, so
 * a kit publishes it on the host instead.
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
 * that one directive. `none` — the same as leaving it unset — is plain HTTP,
 * for a gateway behind something that already terminates TLS (a Cloudflare
 * tunnel). A kit rejects any other value: an ACME/public pipeline is a
 * genuine feature nobody has asked for yet, so it isn't invented ahead of
 * that need.
 */
export const gatewayV1: ResourceContract = new ResourceContract(
  "networking",
  "gateway",
  "v1",
  [
    { name: "networks", required: false, type: "array" },
    { name: "routes", required: true, type: "array" },
    { name: "tls", required: false, type: "string" },
  ],
  [],
  [],
  [],
);
