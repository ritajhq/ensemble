import type { Referenceable } from "./reference.ts";
import type { JsonValue } from "./json.ts";

/** Every networking kind this spec understands. Service mesh is deliberately excluded — see taxonomy doc. */
export type NetworkingKind = "load-balancer" | "dns" | "cdn" | "gateway";

interface NetworkingBase {
  class?: string;
  /** Raw, target-native config a kit may merge into its own translation of this one entry, keyed by target name. Opaque to the SDK — see storage.ts's StorageBase.overrides. */
  overrides?: Record<string, JsonValue>;
}

/** Shared by every networking kind that actually runs a target-native service (everything but `dns`, which provisions records, not a listener). */
interface RuntimeNetworkingBase extends NetworkingBase {
  /** Joins this entry's runtime service to an externally-managed network — typically `${external.<name>.name}` (see external.ts), e.g. a host's pre-existing edge/ingress network another stack already runs on. */
  network?: Referenceable;
}

/** Listener + backend + health check (ALB/NLB, Cloud Load Balancing, Azure Load Balancer/App Gateway). One kind, not split by layer — provisioning shape is otherwise identical. */
export interface LoadBalancer extends RuntimeNetworkingBase {
  type: "load-balancer";
  layer: "l4" | "l7";
}

/** Zone + records (Route53, Cloud DNS, Azure DNS). No meaningful non-cloud/local translator target — see taxonomy doc. */
export interface Dns extends NetworkingBase {
  type: "dns";
  zone: string;
}

/**
 * CloudFront, Cloud CDN, Azure CDN/Front Door, Cloudflare. `origin` typically
 * references another declared resource's output (e.g. an object-storage
 * entry's URL) — this is the mechanism that lets a static site be modeled as
 * storage + cdn instead of its own compute kind. See taxonomy doc.
 */
export interface Cdn extends RuntimeNetworkingBase {
  type: "cdn";
  origin: Referenceable;
}

/**
 * A single request-routing rule: requests whose path matches `path` (a
 * prefix, e.g. "/v1/*") go to `target` — typically another declared entry's
 * named-port address (`${compute.server.http}`), not a literal, since the
 * whole point is routing to entries this workload itself declares.
 */
export interface GatewayRoute {
  path: string;
  target: Referenceable;
}

/**
 * One edge listener with path-based routing to multiple backends —
 * Kubernetes' own Gateway API (the deliberate successor to Ingress for this
 * exact job) is the clearest naming precedent: a `Gateway` (listener) with
 * attached `HTTPRoute`s, kept as a distinct concept from a plain
 * L4/L7 `LoadBalancer` (which has no routing — one listener, one backend)
 * and from `Cdn` (edge/global, typically proxies to one origin — often a
 * `LoadBalancer` or `Gateway` itself, per the real CloudFront-in-front-of-ALB
 * pattern). Maps onto AWS ALB listener rules, GCP URL maps, Azure
 * Application Gateway path rules, Kubernetes Gateway+HTTPRoute.
 */
export interface Gateway extends RuntimeNetworkingBase {
  type: "gateway";
  routes: GatewayRoute[];
}

export type Networking = LoadBalancer | Dns | Cdn | Gateway;
