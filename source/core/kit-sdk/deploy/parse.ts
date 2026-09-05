import { parse as parseYaml } from "@std/yaml";
import { parseReference, type Referenceable } from "./reference.ts";
import type { JsonValue } from "./json.ts";
import type {
  Batch,
  Compute,
  ContainerBase,
  ContainerOrchestrated,
  ContainerServerless,
  Development,
  DevelopmentSync,
  FunctionBase,
  FunctionIsolate,
  FunctionRuntime,
  HealthCheck,
  Mount,
  Ports,
  Vm,
  Volume,
} from "./compute.ts";
import type { Database } from "./databases.ts";
import type {
  Cdn,
  Dns,
  Gateway,
  GatewayRoute,
  LoadBalancer,
  Networking,
} from "./networking.ts";
import type { Messaging } from "./messaging.ts";
import type { Secret } from "./secrets.ts";
import type { Storage } from "./storage.ts";
import type { External, Network } from "./external.ts";
import type { Release } from "./release.ts";
import type { Workload } from "./workload.ts";

export class WorkloadParseError extends Error {}

function fail(file: string, message: string): never {
  throw new WorkloadParseError(`${file}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(file: string, where: string, raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) {
    fail(file, `${where} must be a non-empty string.`);
  }
  return raw;
}

function optionalString(
  file: string,
  where: string,
  raw: unknown,
): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") fail(file, `${where} must be a string.`);
  return raw;
}

function requireNumber(file: string, where: string, raw: unknown): number {
  if (typeof raw !== "number") fail(file, `${where} must be a number.`);
  return raw;
}

function optionalNumber(
  file: string,
  where: string,
  raw: unknown,
): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "number") fail(file, `${where} must be a number.`);
  return raw;
}

/** A field accepting either a literal string or a `${<category>.<name>.<output>}` Reference — see reference.ts. */
function validateReferenceable(
  file: string,
  where: string,
  raw: unknown,
): Referenceable {
  if (typeof raw !== "string" || raw.length === 0) {
    fail(file, `${where} must be a non-empty string.`);
  }
  if (raw.startsWith("${")) {
    const ref = parseReference(raw);
    if (!ref) {
      fail(
        file,
        `${where} looks like a reference but isn't valid — expected \${<category>.<name>.<output>}, got "${raw}".`,
      );
    }
    return ref;
  }
  return raw;
}

function optionalReferenceable(
  file: string,
  where: string,
  raw: unknown,
): Referenceable | undefined {
  if (raw === undefined) return undefined;
  return validateReferenceable(file, where, raw);
}

/** `overrides` is opaque per-target payload (see e.g. storage.ts's StorageBase.overrides) — only checked to be a mapping keyed by target name; whatever's under each key is passed through untouched for that target's own kit to interpret. */
function validateOverrides(
  file: string,
  where: string,
  raw: unknown,
): Record<string, JsonValue> | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) {
    fail(file, `${where} must be a mapping keyed by target name.`);
  }
  return raw as Record<string, JsonValue>;
}

function validateEnv(
  file: string,
  where: string,
  raw: unknown,
): Record<string, Referenceable> | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) fail(file, `${where} must be a mapping.`);
  const env: Record<string, Referenceable> = {};
  for (const [key, value] of Object.entries(raw)) {
    env[key] = validateReferenceable(file, `${where}.${key}`, value);
  }
  return env;
}

function validatePorts(
  file: string,
  where: string,
  raw: unknown,
): Ports | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || Object.keys(raw).length === 0) {
    fail(file, `${where} must be a non-empty mapping of port name to number.`);
  }
  const ports: Ports = {};
  for (const [name, value] of Object.entries(raw)) {
    ports[name] = requireNumber(file, `${where}.${name}`, value);
  }
  return ports;
}

function validateHealthCheck(
  file: string,
  where: string,
  raw: unknown,
): HealthCheck | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) fail(file, `${where} must be a mapping.`);
  return {
    path: requireString(file, `${where}.path`, raw.path),
    interval: requireNumber(file, `${where}.interval`, raw.interval),
    timeout: requireNumber(file, `${where}.timeout`, raw.timeout),
  };
}

function validateVolumes(
  file: string,
  where: string,
  raw: unknown,
): Volume[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length === 0) {
    fail(file, `${where} must be a non-empty list.`);
  }
  return raw.map((entry, i) => {
    const entryWhere = `${where}[${i}]`;
    if (!isRecord(entry)) fail(file, `${entryWhere} must be a mapping.`);
    return {
      mountPath: requireString(
        file,
        `${entryWhere}.mountPath`,
        entry.mountPath,
      ),
      sizeGb: requireNumber(file, `${entryWhere}.sizeGb`, entry.sizeGb),
    };
  });
}

function validateMounts(
  file: string,
  where: string,
  raw: unknown,
): Mount[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length === 0) {
    fail(file, `${where} must be a non-empty list.`);
  }
  return raw.map((entry, i) => {
    const entryWhere = `${where}[${i}]`;
    if (!isRecord(entry)) fail(file, `${entryWhere} must be a mapping.`);
    return {
      storage: requireString(file, `${entryWhere}.storage`, entry.storage),
      path: requireString(file, `${entryWhere}.path`, entry.path),
    };
  });
}

function validateDevelopmentSync(
  file: string,
  where: string,
  raw: unknown,
): DevelopmentSync {
  if (!isRecord(raw)) fail(file, `${where} must be a mapping.`);
  const action = raw.action;
  if (
    action !== undefined && action !== "sync" && action !== "sync+restart"
  ) {
    fail(
      file,
      `${where}.action must be "sync" or "sync+restart", got ${
        JSON.stringify(action)
      }.`,
    );
  }
  return {
    app: requireString(file, `${where}.app`, raw.app),
    path: requireString(file, `${where}.path`, raw.path),
    action,
  };
}

function validateDevelopment(
  file: string,
  where: string,
  raw: unknown,
): Development | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) fail(file, `${where} must be a mapping.`);
  const syncRaw = raw.sync;
  if (
    syncRaw !== undefined && (!Array.isArray(syncRaw) || syncRaw.length === 0)
  ) {
    fail(file, `${where}.sync must be a non-empty list.`);
  }
  const sync = (syncRaw as unknown[] | undefined)?.map((entry, i) =>
    validateDevelopmentSync(file, `${where}.sync[${i}]`, entry)
  );
  return { sync };
}

function validateContainerBase(
  file: string,
  where: string,
  raw: Record<string, unknown>,
): ContainerBase {
  return {
    image: validateReferenceable(file, `${where}.image`, raw.image),
    env: validateEnv(file, `${where}.env`, raw.env),
    ports: validatePorts(file, `${where}.ports`, raw.ports),
    health: validateHealthCheck(file, `${where}.health`, raw.health),
    volumes: validateVolumes(file, `${where}.volumes`, raw.volumes),
    mounts: validateMounts(file, `${where}.mounts`, raw.mounts),
    development: validateDevelopment(
      file,
      `${where}.development`,
      raw.development,
    ),
    network: optionalReferenceable(file, `${where}.network`, raw.network),
    overrides: validateOverrides(file, `${where}.overrides`, raw.overrides),
  };
}

function validateContainerOrchestrated(
  file: string,
  where: string,
  raw: Record<string, unknown>,
): ContainerOrchestrated {
  const base = validateContainerBase(file, where, raw);
  const resourcesRaw = raw.resources;
  if (resourcesRaw !== undefined && !isRecord(resourcesRaw)) {
    fail(file, `${where}.resources must be a mapping.`);
  }
  const affinityRaw = raw.affinity;
  if (affinityRaw !== undefined && !isRecord(affinityRaw)) {
    fail(file, `${where}.affinity must be a mapping.`);
  }
  return {
    ...base,
    type: "container-orchestrated",
    replicas: requireNumber(file, `${where}.replicas`, raw.replicas),
    resources: resourcesRaw as ContainerOrchestrated["resources"],
    affinity: affinityRaw as Record<string, string> | undefined,
  };
}

function validateContainerServerless(
  file: string,
  where: string,
  raw: Record<string, unknown>,
): ContainerServerless {
  const base = validateContainerBase(file, where, raw);
  return {
    ...base,
    type: "container-serverless",
    concurrency: optionalNumber(file, `${where}.concurrency`, raw.concurrency),
    minInstances: optionalNumber(
      file,
      `${where}.minInstances`,
      raw.minInstances,
    ),
    maxInstances: optionalNumber(
      file,
      `${where}.maxInstances`,
      raw.maxInstances,
    ),
  };
}

function validateTrigger(
  file: string,
  where: string,
  raw: unknown,
): FunctionBase["trigger"] {
  if (!isRecord(raw)) fail(file, `${where} must be a mapping.`);
  if (raw.type === "http") return { type: "http" };
  if (raw.type === "event") {
    return {
      type: "event",
      source: requireString(file, `${where}.source`, raw.source),
    };
  }
  fail(file, `${where}.type must be "http" or "event".`);
}

function validateFunctionBase(
  file: string,
  where: string,
  raw: Record<string, unknown>,
): FunctionBase {
  return {
    handler: requireString(file, `${where}.handler`, raw.handler),
    trigger: validateTrigger(file, `${where}.trigger`, raw.trigger),
    env: validateEnv(file, `${where}.env`, raw.env),
    overrides: validateOverrides(file, `${where}.overrides`, raw.overrides),
  };
}

function validateFunctionRuntime(
  file: string,
  where: string,
  raw: Record<string, unknown>,
): FunctionRuntime {
  const base = validateFunctionBase(file, where, raw);
  return {
    ...base,
    type: "function-runtime",
    timeoutSeconds: requireNumber(
      file,
      `${where}.timeoutSeconds`,
      raw.timeoutSeconds,
    ),
    memoryMb: requireNumber(file, `${where}.memoryMb`, raw.memoryMb),
  };
}

function validateFunctionIsolate(
  file: string,
  where: string,
  raw: Record<string, unknown>,
): FunctionIsolate {
  const base = validateFunctionBase(file, where, raw);
  return {
    ...base,
    type: "function-isolate",
    cpuTimeMs: requireNumber(file, `${where}.cpuTimeMs`, raw.cpuTimeMs),
  };
}

function validateBatch(
  file: string,
  where: string,
  raw: Record<string, unknown>,
): Batch {
  const commandRaw = raw.command;
  if (
    commandRaw !== undefined &&
    (!Array.isArray(commandRaw) ||
      commandRaw.some((c) => typeof c !== "string"))
  ) {
    fail(file, `${where}.command must be a list of strings.`);
  }
  return {
    type: "batch",
    image: validateReferenceable(file, `${where}.image`, raw.image),
    command: commandRaw as string[] | undefined,
    env: validateEnv(file, `${where}.env`, raw.env),
    retries: requireNumber(file, `${where}.retries`, raw.retries),
    schedule: optionalString(file, `${where}.schedule`, raw.schedule),
    overrides: validateOverrides(file, `${where}.overrides`, raw.overrides),
  };
}

function validateVm(
  file: string,
  where: string,
  raw: Record<string, unknown>,
): Vm {
  return {
    type: "vm",
    image: validateReferenceable(file, `${where}.image`, raw.image),
    instanceSize: requireString(
      file,
      `${where}.instanceSize`,
      raw.instanceSize,
    ),
    volumes: validateVolumes(file, `${where}.volumes`, raw.volumes),
    mounts: validateMounts(file, `${where}.mounts`, raw.mounts),
    ports: validatePorts(file, `${where}.ports`, raw.ports),
    overrides: validateOverrides(file, `${where}.overrides`, raw.overrides),
  };
}

const COMPUTE_VALIDATORS: Record<
  string,
  (file: string, where: string, raw: Record<string, unknown>) => Compute
> = {
  "container-orchestrated": validateContainerOrchestrated,
  "container-serverless": validateContainerServerless,
  "function-runtime": validateFunctionRuntime,
  "function-isolate": validateFunctionIsolate,
  "batch": validateBatch,
  "vm": validateVm,
};

function validateComputeEntry(
  file: string,
  where: string,
  raw: unknown,
): Compute {
  if (!isRecord(raw)) fail(file, `${where} must be a mapping.`);
  const type = raw.type;
  if (typeof type !== "string" || !Object.hasOwn(COMPUTE_VALIDATORS, type)) {
    fail(
      file,
      `${where}.type must be one of ${
        Object.keys(COMPUTE_VALIDATORS).join(", ")
      }, got ${JSON.stringify(type)}.`,
    );
  }
  return COMPUTE_VALIDATORS[type](file, where, raw);
}

function validateCompute(
  file: string,
  raw: unknown,
): Record<string, Compute> | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || Object.keys(raw).length === 0) {
    fail(file, `"compute" must be a non-empty mapping.`);
  }
  const compute: Record<string, Compute> = {};
  for (const [name, entry] of Object.entries(raw)) {
    compute[name] = validateComputeEntry(file, `compute.${name}`, entry);
  }
  return compute;
}

function validateStorageEntry(
  file: string,
  where: string,
  raw: unknown,
): Storage {
  if (!isRecord(raw)) fail(file, `${where} must be a mapping.`);
  const type = raw.type;
  const cls = optionalString(file, `${where}.class`, raw.class);
  const overrides = validateOverrides(
    file,
    `${where}.overrides`,
    raw.overrides,
  );
  if (type === "object-storage") return { type, class: cls, overrides };
  if (type === "file-storage") return { type, class: cls, overrides };
  fail(
    file,
    `${where}.type must be "object-storage" or "file-storage", got ${
      JSON.stringify(type)
    }.`,
  );
}

function validateStorage(
  file: string,
  raw: unknown,
): Record<string, Storage> | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || Object.keys(raw).length === 0) {
    fail(file, `"storage" must be a non-empty mapping.`);
  }
  const storage: Record<string, Storage> = {};
  for (const [name, entry] of Object.entries(raw)) {
    storage[name] = validateStorageEntry(file, `storage.${name}`, entry);
  }
  return storage;
}

function validateDatabaseEntry(
  file: string,
  where: string,
  raw: unknown,
): Database {
  if (!isRecord(raw)) fail(file, `${where} must be a mapping.`);
  const type = raw.type;
  const base = {
    class: optionalString(file, `${where}.class`, raw.class),
    engine: optionalString(file, `${where}.engine`, raw.engine),
    version: optionalString(file, `${where}.version`, raw.version),
    overrides: validateOverrides(file, `${where}.overrides`, raw.overrides),
  };
  if (
    type === "relational" || type === "key-value" || type === "document" ||
    type === "cache"
  ) {
    return { ...base, type };
  }
  fail(
    file,
    `${where}.type must be one of relational, key-value, document, cache, got ${
      JSON.stringify(type)
    }.`,
  );
}

function validateDatabases(
  file: string,
  raw: unknown,
): Record<string, Database> | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || Object.keys(raw).length === 0) {
    fail(file, `"databases" must be a non-empty mapping.`);
  }
  const databases: Record<string, Database> = {};
  for (const [name, entry] of Object.entries(raw)) {
    databases[name] = validateDatabaseEntry(file, `databases.${name}`, entry);
  }
  return databases;
}

function validateMessagingEntry(
  file: string,
  where: string,
  raw: unknown,
): Messaging {
  if (!isRecord(raw)) fail(file, `${where} must be a mapping.`);
  const type = raw.type;
  const cls = optionalString(file, `${where}.class`, raw.class);
  const overrides = validateOverrides(
    file,
    `${where}.overrides`,
    raw.overrides,
  );
  if (type === "queue") return { type, class: cls, overrides };
  if (type === "pub-sub") return { type, class: cls, overrides };
  fail(
    file,
    `${where}.type must be "queue" or "pub-sub", got ${JSON.stringify(type)}.`,
  );
}

function validateMessaging(
  file: string,
  raw: unknown,
): Record<string, Messaging> | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || Object.keys(raw).length === 0) {
    fail(file, `"messaging" must be a non-empty mapping.`);
  }
  const messaging: Record<string, Messaging> = {};
  for (const [name, entry] of Object.entries(raw)) {
    messaging[name] = validateMessagingEntry(file, `messaging.${name}`, entry);
  }
  return messaging;
}

interface NetworkingEntryBase {
  cls: string | undefined;
  network: Referenceable | undefined;
  overrides: Record<string, JsonValue> | undefined;
}

function validateLoadBalancer(
  file: string,
  where: string,
  base: NetworkingEntryBase,
  raw: Record<string, unknown>,
): LoadBalancer {
  const layer = raw.layer;
  if (layer !== "l4" && layer !== "l7") {
    fail(
      file,
      `${where}.layer must be "l4" or "l7", got ${JSON.stringify(layer)}.`,
    );
  }
  return {
    class: base.cls,
    network: base.network,
    overrides: base.overrides,
    type: "load-balancer",
    layer,
  };
}

function validateDns(
  file: string,
  where: string,
  base: NetworkingEntryBase,
  raw: Record<string, unknown>,
): Dns {
  if (base.network !== undefined) {
    fail(
      file,
      `${where}.network isn't meaningful for a "dns" entry — nothing runtime to place on a network.`,
    );
  }
  return {
    class: base.cls,
    overrides: base.overrides,
    type: "dns",
    zone: requireString(file, `${where}.zone`, raw.zone),
  };
}

function validateCdn(
  file: string,
  where: string,
  base: NetworkingEntryBase,
  raw: Record<string, unknown>,
): Cdn {
  return {
    class: base.cls,
    network: base.network,
    overrides: base.overrides,
    type: "cdn",
    origin: validateReferenceable(file, `${where}.origin`, raw.origin),
  };
}

function validateGatewayRoutes(
  file: string,
  where: string,
  raw: unknown,
): GatewayRoute[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    fail(file, `${where} must be a non-empty list.`);
  }
  return raw.map((entry, i) => {
    const entryWhere = `${where}[${i}]`;
    if (!isRecord(entry)) fail(file, `${entryWhere} must be a mapping.`);
    return {
      path: requireString(file, `${entryWhere}.path`, entry.path),
      target: validateReferenceable(file, `${entryWhere}.target`, entry.target),
    };
  });
}

function validateGateway(
  file: string,
  where: string,
  base: NetworkingEntryBase,
  raw: Record<string, unknown>,
): Gateway {
  return {
    class: base.cls,
    network: base.network,
    overrides: base.overrides,
    type: "gateway",
    routes: validateGatewayRoutes(file, `${where}.routes`, raw.routes),
  };
}

function validateNetworkingEntry(
  file: string,
  where: string,
  raw: unknown,
): Networking {
  if (!isRecord(raw)) fail(file, `${where} must be a mapping.`);
  const base: NetworkingEntryBase = {
    cls: optionalString(file, `${where}.class`, raw.class),
    network: optionalReferenceable(file, `${where}.network`, raw.network),
    overrides: validateOverrides(file, `${where}.overrides`, raw.overrides),
  };
  switch (raw.type) {
    case "load-balancer":
      return validateLoadBalancer(file, where, base, raw);
    case "dns":
      return validateDns(file, where, base, raw);
    case "cdn":
      return validateCdn(file, where, base, raw);
    case "gateway":
      return validateGateway(file, where, base, raw);
    default:
      fail(
        file,
        `${where}.type must be one of load-balancer, dns, cdn, gateway, got ${
          JSON.stringify(raw.type)
        }.`,
      );
  }
}

function validateNetworking(
  file: string,
  raw: unknown,
): Record<string, Networking> | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || Object.keys(raw).length === 0) {
    fail(file, `"networking" must be a non-empty mapping.`);
  }
  const networking: Record<string, Networking> = {};
  for (const [name, entry] of Object.entries(raw)) {
    networking[name] = validateNetworkingEntry(
      file,
      `networking.${name}`,
      entry,
    );
  }
  return networking;
}

function validateSecretEntry(
  file: string,
  where: string,
  raw: unknown,
): Secret {
  if (!isRecord(raw)) fail(file, `${where} must be a mapping.`);
  if (raw.type !== "secret") {
    fail(
      file,
      `${where}.type must be "secret", got ${JSON.stringify(raw.type)}.`,
    );
  }
  return {
    type: "secret",
    class: optionalString(file, `${where}.class`, raw.class),
    overrides: validateOverrides(file, `${where}.overrides`, raw.overrides),
  };
}

function validateSecrets(
  file: string,
  raw: unknown,
): Record<string, Secret> | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || Object.keys(raw).length === 0) {
    fail(file, `"secrets" must be a non-empty mapping.`);
  }
  const secrets: Record<string, Secret> = {};
  for (const [name, entry] of Object.entries(raw)) {
    secrets[name] = validateSecretEntry(file, `secrets.${name}`, entry);
  }
  return secrets;
}

function validateExternalNetwork(
  file: string,
  where: string,
  raw: Record<string, unknown>,
): Network {
  return {
    type: "network",
    name: requireString(file, `${where}.name`, raw.name),
    overrides: validateOverrides(file, `${where}.overrides`, raw.overrides),
  };
}

function validateExternalEntry(
  file: string,
  where: string,
  raw: unknown,
): External {
  if (!isRecord(raw)) fail(file, `${where} must be a mapping.`);
  if (raw.type === "network") {
    return validateExternalNetwork(file, where, raw);
  }
  fail(
    file,
    `${where}.type must be "network", got ${JSON.stringify(raw.type)}.`,
  );
}

function validateExternal(
  file: string,
  raw: unknown,
): Record<string, External> | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || Object.keys(raw).length === 0) {
    fail(file, `"external" must be a non-empty mapping.`);
  }
  const external: Record<string, External> = {};
  for (const [name, entry] of Object.entries(raw)) {
    external[name] = validateExternalEntry(file, `external.${name}`, entry);
  }
  return external;
}

function validateReleaseEntry(
  file: string,
  where: string,
  raw: unknown,
): Release {
  if (!isRecord(raw)) fail(file, `${where} must be a mapping.`);
  return {
    kit: requireString(file, `${where}.kit`, raw.kit),
    mode: optionalString(file, `${where}.mode`, raw.mode),
    outputName: optionalString(file, `${where}.outputName`, raw.outputName),
    publish: optionalString(file, `${where}.publish`, raw.publish),
  };
}

function validateRelease(
  file: string,
  raw: unknown,
): Record<string, Release> | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || Object.keys(raw).length === 0) {
    fail(file, `"release" must be a non-empty mapping.`);
  }
  const release: Record<string, Release> = {};
  for (const [name, entry] of Object.entries(raw)) {
    release[name] = validateReleaseEntry(file, `release.${name}`, entry);
  }
  return release;
}

/** Reads and validates a workload YAML file, throwing WorkloadParseError with file context on failure. */
export async function parseWorkloadFile(file: string): Promise<Workload> {
  const text = await Deno.readTextFile(file);
  return parseWorkloadText(file, text);
}

/**
 * Validates already-read workload YAML text, throwing WorkloadParseError
 * with file context on failure. `file` is used only for error messages.
 * Validates every declared entry's shape and every `Reference` it contains
 * against known category/kind vocabulary, but does NOT check that a
 * reference's `(category, name)` actually resolves to a declared entry, or
 * detect reference cycles — see validateReferences/buildBatches in graph.ts,
 * run as a separate pass once the whole Workload is parsed.
 *
 * `compute`/`storage`/`databases`/`messaging`/`networking`/`secrets`/
 * `external` are read from a `deploy:` wrapper — a pure YAML-authoring
 * convenience that separates them from `release:`, which stays a top-level
 * sibling of `deploy:` rather than nested under it. The wrapper is stripped
 * here; it has no effect on the in-memory `Workload` shape or on
 * `${category.name.output}` references, which are unaffected by it.
 */
export function parseWorkloadText(file: string, text: string): Workload {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (error) {
    fail(
      file,
      `invalid YAML (${error instanceof Error ? error.message : error}).`,
    );
  }
  if (!isRecord(raw)) fail(file, `must be a mapping.`);

  const deployRaw = raw.deploy;
  if (deployRaw !== undefined && !isRecord(deployRaw)) {
    fail(file, `"deploy" must be a mapping.`);
  }
  const deploy = (deployRaw ?? {}) as Record<string, unknown>;

  const workload: Workload = {
    compute: validateCompute(file, deploy.compute),
    storage: validateStorage(file, deploy.storage),
    databases: validateDatabases(file, deploy.databases),
    messaging: validateMessaging(file, deploy.messaging),
    networking: validateNetworking(file, deploy.networking),
    secrets: validateSecrets(file, deploy.secrets),
    external: validateExternal(file, deploy.external),
    release: validateRelease(file, raw.release),
  };

  return workload;
}
