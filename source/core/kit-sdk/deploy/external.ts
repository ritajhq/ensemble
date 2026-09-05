import type { JsonValue } from "./json.ts";

/**
 * Every kind of externally-managed thing this spec can reference. Deliberately
 * narrow today — only what's actually needed (an existing network to join,
 * e.g. an edge/ingress network another stack already runs on) — not a
 * speculative general "external resource" abstraction. Extend this union
 * if/when a real second need shows up (an existing bucket, an existing
 * managed database) rather than designing for it now. Kept target-agnostic
 * like every other kind in this spec (`load-balancer`, `object-storage`,
 * ...) — never name a specific technology here (no "docker-network"); each
 * kit decides what "network" means for its own target (Compose's own
 * `external: true` network, an AWS VPC looked up by name/tag, a Kubernetes
 * NetworkAttachmentDefinition).
 */
export type ExternalKind = "network";

/**
 * A reference to something this workload does NOT provision or manage the
 * lifecycle of — Terraform's `data` block is the precedent this mirrors:
 * a separate, explicit "look up, don't own" declaration, kept distinct from
 * every other category (which all provision what they declare). Other
 * entries point at an `external` entry the same way they point at anything
 * else — `${external.<name>.<output>}` — so an external entry participates
 * in the same reference/dependency-graph mechanism as a provisioned one, and
 * a typo'd reference to it is still caught at parse/graph time rather than
 * failing only once a kit hands a bad name to the real infrastructure.
 */
interface ExternalBase {
  /** Raw, target-native config a kit may merge into its own translation of this one entry, keyed by target name. Opaque to the SDK — see storage.ts's StorageBase.overrides. */
  overrides?: Record<string, JsonValue>;
}

/**
 * A network created and owned outside this workload — e.g. an existing
 * `edge` network a host's own reverse-proxy/tunnel setup already runs on,
 * that a `gateway`/`load-balancer`/`cdn` entry (or a container compute
 * entry) needs to join so traffic from that existing setup can reach it.
 * `name` is the network's real identifier in the external system (a Docker
 * network name, a VPC name/tag a kit looks up, ...), which may differ from
 * this entry's own manifest key.
 */
export interface Network extends ExternalBase {
  type: "network";
  name: string;
}

export type External = Network;
