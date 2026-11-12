import { ResourceContract } from "../contract.ts";

/**
 * `gateway.v1` — an HTTP ingress that host/path-routes to targets inside the
 * workload: a compute (`target: { service }`), or a bucket's objects
 * (`target: { storage }`, an `object-storage` resource). Compose implements
 * host and path routing to computes; the aws kit (a CloudFront distribution)
 * and the cloudflare kit (a gateway Worker) route by path only, to functions
 * and buckets, and both want a catch-all (`/*`) route.
 *
 * `networks` names the ingress networks something in front of the gateway
 * reaches it through — same `${external.<name>.name}` convention
 * `container.v1`'s own `networks` entries use, or a whole
 * `${variables.<name>.value}` of a `type: list` variable so each environment
 * picks its own. None (absent or empty) means nothing fronts the gateway, so
 * a kit publishes it on the host instead.
 *
 * `alias` is the DNS name the gateway answers to on those ingress networks,
 * for a network several gateways share (one per deployment, behind one
 * router): a gateway's service is named alike in every stack, so the name
 * alone would be ambiguous there. Unset, a kit gives it a name unique to the
 * deployment (compose: the project name) and reports it as an `Ingress`
 * without one, for the deployment's own name to fill in.
 *
 * `routes` is shallow at the contract level (`type: "array"`), same
 * treatment as `container.v1`'s `mounts`/`development`: the
 * per-entry shape — `{ host, path, target: { service, port } }` or
 * `{ path, target: { storage } }`, `path`
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
 * There is no `tls`: who ends TLS in front of a gateway is the host's
 * concern (a tunnel, a host-level proxy, `ens develop`'s local proxy), not
 * the application's, so a kit derives it from where it deploys.
 */
export const gatewayV1: ResourceContract = new ResourceContract(
  "networking",
  "gateway",
  "v1",
  [
    { name: "networks", required: false, type: "array" },
    { name: "alias", required: false, type: "string" },
    { name: "routes", required: true, type: "array" },
  ],
  [],
  [],
  [],
);
