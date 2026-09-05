import type { Referenceable } from "./reference.ts";
import type { JsonValue } from "./json.ts";

/** Every compute kind this spec understands. See the taxonomy doc for what each maps to per-provider. */
export type ComputeKind =
  | "container-orchestrated"
  | "container-serverless"
  | "function-runtime"
  | "function-isolate"
  | "batch"
  | "vm";

export interface HealthCheck {
  path: string;
  interval: number;
  timeout: number;
}

/** Ports this compute entry listens on, keyed by name — the name a `${category.name.<port-name>}` Reference addresses (see graph.ts), and what a target may relay back into the container as an env var (e.g. the compose kit's `<NAME>_PORT`/`PORT` injection). */
export type Ports = Record<string, number>;

/** A block-storage attachment (EBS/Persistent Disk/Azure Managed Disks-shaped) — not an independent resource, since nothing else references its output. */
export interface Volume {
  mountPath: string;
  sizeGb: number;
}

/**
 * Mounts a declared `file-storage` entry (a networked, multi-attach
 * filesystem — EFS/Filestore/Azure Files-shaped) into a container/VM's own
 * filesystem at `path`. Unlike every other resource kind, file-storage isn't
 * consumed via a `${storage.name.output}` string reference — every real
 * target mounts it as a filesystem primitive (EFS into an ECS task
 * definition or EKS pod's `volumes`, Filestore via a GKE CSI driver, Azure
 * Files the same way), never as a connection string a client library reads.
 * `storage` names a `file-storage` entry declared in the same workload.
 */
export interface Mount {
  storage: string;
  path: string;
}

/**
 * Syncs one `ens build`-produced app's output straight into this compute
 * entry's already-running instance during `ens deploy up --watch`, instead
 * of rebuilding and redeploying the image on every source change. `app`
 * names a key under `.ensemble/config.yaml`'s `build:` (the same vocabulary
 * `ens build <app>` and a docker pack kit's `--from=<app>` build contexts
 * use), resolved by the deploy kit to that app's output directory under
 * `artifacts/<app>/`. `action` mirrors Compose's own `develop.watch` actions
 * (a "sync"-shaped mechanism, not compose-specific — Kubernetes dev-loop
 * tools like Tilt/Skaffold do the same live-sync-into-a-running-instance
 * thing) — "sync" for a process that picks up the new files on its own
 * (e.g. a hot-reloading dev server), "sync+restart" (the default) when the
 * process needs restarting to pick up the change, which covers most
 * workloads including a plain long-running server process.
 */
export interface DevelopmentSync {
  app: string;
  path: string;
  action?: "sync" | "sync+restart";
}

/** Development-only wiring a compute entry may declare, consulted solely by `ens deploy up --watch` — has no effect on a plain `ens deploy up`. */
export interface Development {
  sync?: DevelopmentSync[];
}

/** Fields shared by both container kinds. Env values may reference another declared entry's output. */
export interface ContainerBase {
  image: Referenceable;
  env?: Record<string, Referenceable>;
  ports?: Ports;
  health?: HealthCheck;
  volumes?: Volume[];
  mounts?: Mount[];
  development?: Development;
  /** Joins this entry to an externally-managed network — typically `${external.<name>.name}` (see external.ts), e.g. a host's pre-existing edge/ingress network another stack already runs on. */
  network?: Referenceable;
  /** Raw, target-native config a kit may merge into its own translation of this one entry, keyed by target name (e.g. `overrides["aws-terraform"]`) — an escape hatch for per-resource customization a kit's defaults don't cover. Opaque to the SDK; only the named target's own kit interprets it. */
  overrides?: Record<string, JsonValue>;
}

/** You author the container-orchestration API shape (Compose, bare-metal/on-prem K8s, EKS/GKE-standard/AKS, GKE Autopilot — see taxonomy doc: kind is decided by API surface authored, not by who manages the nodes). */
export interface ContainerOrchestrated extends ContainerBase {
  type: "container-orchestrated";
  replicas: number;
  resources?: {
    requestCpu?: string;
    requestMemory?: string;
    limitCpu?: string;
    limitMemory?: string;
  };
  affinity?: Record<string, string>;
}

/** Image + port, no cluster API surface (Fargate/App Runner, Cloud Run services, Container Apps, ACI, App Engine flexible/standard). */
export interface ContainerServerless extends ContainerBase {
  type: "container-serverless";
  concurrency?: number;
  minInstances?: number;
  maxInstances?: number;
}

export interface FunctionBase {
  handler: string;
  trigger: { type: "http" } | { type: "event"; source: string };
  env?: Record<string, Referenceable>;
  /** Raw, target-native config a kit may merge into its own translation of this one entry, keyed by target name. Opaque to the SDK — see ContainerBase.overrides. */
  overrides?: Record<string, JsonValue>;
}

/** Full language runtime, filesystem access, multi-minute timeouts (Lambda, Cloud Functions, Azure Functions). */
export interface FunctionRuntime extends FunctionBase {
  type: "function-runtime";
  timeoutSeconds: number;
  memoryMb: number;
}

/** V8-isolate-class runtime: no filesystem, strict CPU-time ceiling, often restricted outbound networking (Cloudflare Workers, Lambda@Edge). Split from function-runtime so a translator can reject filesystem-assuming specs at the type level. */
export interface FunctionIsolate extends FunctionBase {
  type: "function-isolate";
  cpuTimeMs: number;
}

/** Run-to-completion or scheduled, retries on failure, no ports (AWS Batch, ECS run-task, Cloud Run Jobs, Container Apps Jobs, Azure Batch). */
export interface Batch {
  type: "batch";
  image: Referenceable;
  command?: string[];
  env?: Record<string, Referenceable>;
  retries: number;
  schedule?: string;
  /** Raw, target-native config a kit may merge into its own translation of this one entry, keyed by target name. Opaque to the SDK — see ContainerBase.overrides. */
  overrides?: Record<string, JsonValue>;
}

/** A single fixed instance, full OS control, always-on, no scaling policy (EC2, Compute Engine, Azure VMs, Lightsail). VM fleets are an explicitly deferred gap — see taxonomy doc. */
export interface Vm {
  type: "vm";
  image: Referenceable;
  instanceSize: string;
  volumes?: Volume[];
  mounts?: Mount[];
  ports?: Ports;
  /** Raw, target-native config a kit may merge into its own translation of this one entry, keyed by target name. Opaque to the SDK — see ContainerBase.overrides. */
  overrides?: Record<string, JsonValue>;
}

/** One declared compute entry, discriminated by `type`. A workload may declare zero or more — e.g. zero for a static-site workload composed purely of storage + cdn resources, or several for an API service plus a worker process sharing the same databases. */
export type Compute =
  | ContainerOrchestrated
  | ContainerServerless
  | FunctionRuntime
  | FunctionIsolate
  | Batch
  | Vm;
