import { basename, dirname, join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { stringify as stringifyYaml } from "@std/yaml";
import { $ } from "@david/dax";
import * as KitSdk from "@ensemble/kit-sdk";
import {
  ensureExternalNetworkDeclared,
  ensureVolumeDeclared,
  translateDatabase,
  translateExternal,
  translateMessaging,
  translateNetworking,
  translateSecret,
  translateStorage,
  translateVariable,
} from "./backing-services.ts";
import {
  type ComposeDocument,
  type ComposeService,
  newComposeDocument,
} from "./compose-document.ts";

const UNSUPPORTED_COMPUTE_KINDS = new Set<KitSdk.Deploy.ComputeKind>([
  "function-runtime",
  "function-isolate",
  "batch",
  "vm",
]);

/** Resolves one literal-or-`${category.name.output}`-Reference value into a plain string, using `outputs` from every already-resolved entry. A dangling reference resolves to `undefined` rather than throwing — `buildBatches`' own validateReferences pass already guarantees every reference targets a declared entry; it just may not have produced this particular output. */
function resolveReferenceable(
  value: KitSdk.Deploy.Referenceable,
  outputs: Map<string, Record<string, string>>,
): string | undefined {
  if (!KitSdk.Deploy.isReference(value)) return value;
  return outputs.get(`${value.category}.${value.name}`)?.[value.output];
}

/**
 * The Docker image a `release` entry resolves to for `version`, by mode:
 *
 * - **development** (`ens develop`) — the LOCAL packed tag
 *   `<outputName ?? name>:<version>`, matching `ens pack`'s own default tagging
 *   convention. This is the image the dev loop just built.
 * - **production** (a real `ens deploy`) — the PUBLISHED reference the workload
 *   declared, `<publish.name>:<version>`, read verbatim: the deploy kit invents
 *   no registry convention, since the author wires `publish.name` to the full
 *   pushed reference (e.g. `registry.example.com/team/app`). A production entry
 *   whose compute is referenced but which declares no `publish.name` is an
 *   error — there's nothing to run — surfaced by the caller.
 */
function releaseImageTag(
  name: string,
  entry: KitSdk.Deploy.Release,
  version: string,
  development: boolean,
): string {
  if (development) return `${entry.outputName ?? name}:${version}`;
  if (!entry.publish?.name) {
    throw new Error(
      `release "${name}" is referenced by a production deploy but declares no publish.name — set publish.name to the full published image reference (the deploy resolves \`\${release.${name}.image}\` to it), or use \`ens develop\` to run the locally packed image.`,
    );
  }
  return `${entry.publish.name}:${version}`;
}

/** Resolves `spec`'s `env` (each value a literal or a `${category.name.output}` Reference) into plain strings, using `outputs` from every already-resolved entry. */
function resolveEnv(
  env: Record<string, KitSdk.Deploy.Referenceable> | undefined,
  outputs: Map<string, Record<string, string>>,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(env ?? {})) {
    resolved[key] = resolveReferenceable(value, outputs) ?? "";
  }
  return resolved;
}

/**
 * Relays each declared port's number back into the container as an env var,
 * so the app can bind to the same port it's published/health-checked under
 * instead of a hardcoded value the workload author has to keep in sync by
 * hand (e.g. `server`'s own `PORT` env, which duplicated `ports.http.port`
 * before this existed). Every port gets `<NAME>_PORT`; a sole port also gets
 * the bare `PORT` convention `server`'s app already reads. Wins over any
 * conflicting key in the entry's own `env:` — the container's real listening
 * port can't disagree with what's declared under `ports`.
 */
function portEnvVars(
  ports: KitSdk.Deploy.Ports | undefined,
): Record<string, string> {
  const entries = Object.entries(ports ?? {});
  if (entries.length === 0) return {};
  const vars = Object.fromEntries(
    entries.map(([name, port]) => [`${name.toUpperCase()}_PORT`, `${port}`]),
  );
  if (entries.length === 1) vars.PORT = `${entries[0][1]}`;
  return vars;
}

/**
 * If `network` is declared, resolves it to the external network's real name,
 * ensures it's declared `external: true` on `doc`, and returns the service's
 * full `networks:` list — always including `default` alongside it, since
 * Compose isolates a service to only the networks it explicitly lists once
 * any are given, and every service otherwise relies on the implicit default
 * network for inter-service DNS (e.g. `${compute.server.http}`).
 */
function resolveServiceNetworks(
  network: KitSdk.Deploy.Referenceable | undefined,
  outputs: Map<string, Record<string, string>>,
  doc: ComposeDocument,
  development: boolean,
): string[] | undefined {
  if (!network) return undefined;
  const name = resolveReferenceable(network, outputs);
  if (!name) return undefined;
  ensureExternalNetworkDeclared(doc, name, development);
  return ["default", name];
}

function translateContainerCompute(
  workload: KitSdk.Deploy.Workload,
  spec: KitSdk.Deploy.ContainerOrchestrated | KitSdk.Deploy.ContainerServerless,
  outputs: Map<string, Record<string, string>>,
  artifactsPath: string,
  doc: ComposeDocument,
  development: boolean,
  publishPorts: boolean,
): ComposeService {
  const service: ComposeService = {
    image: resolveReferenceable(spec.image, outputs)!,
    environment: {
      ...resolveEnv(spec.env, outputs),
      ...portEnvVars(spec.ports),
    },
  };

  const networks = resolveServiceNetworks(spec.network, outputs, doc, development);
  if (networks) service.networks = networks;

  // A compute fronted by a gateway is reached through it over the internal
  // network, so it isn't host-published — its ports stay listen-only (still
  // driving PORT env and its `${compute.<name>.http}` target). Only the
  // gateway (and any un-fronted service) is a host entry point.
  const portValues = Object.values(spec.ports ?? {});
  if (publishPorts && portValues.length > 0) {
    service.ports = portValues.map((port) => `${port}:${port}`);
  }
  if (spec.health) {
    const port = portValues[0] ?? 80;
    service.healthcheck = {
      test: [
        "CMD",
        "curl",
        "-f",
        `http://localhost:${port}${spec.health.path}`,
      ],
      interval: `${spec.health.interval}s`,
      timeout: `${spec.health.timeout}s`,
    };
  }
  if (spec.volumes?.length) {
    service.volumes = spec.volumes.map((v) => `${v.mountPath}`);
  }
  if (spec.mounts?.length) {
    const fileStorageNames = new Set(
      Object.entries(workload.storage ?? {})
        .filter(([, s]) => s.type === "file-storage")
        .map(([name]) => name),
    );
    service.volumes = [
      ...(service.volumes ?? []),
      ...spec.mounts.filter((m) => fileStorageNames.has(m.storage)).map((m) =>
        `${m.storage}:${m.path}`
      ),
    ];
  }
  const secretNames = Object.keys(workload.secrets ?? {});
  if (secretNames.length > 0) {
    service.secrets = secretNames;
  }
  if (spec.development?.sync?.length) {
    service.develop = {
      watch: spec.development.sync.map((s) => ({
        path: join(artifactsPath, s.app),
        action: s.action ?? "sync+restart",
        target: s.path,
      })),
    };
  }
  const composeOverride = spec.overrides?.compose as
    | Partial<ComposeService>
    | undefined;
  if (composeOverride?.restart) service.restart = composeOverride.restart;

  return service;
}

/** Every compute entry named as a gateway route's target — i.e. reached through the gateway, so it isn't host-published (see translateContainerCompute's `publishPorts`). */
function gatewayTargetComputeNames(
  workload: KitSdk.Deploy.Workload,
): Set<string> {
  const names = new Set<string>();
  for (const net of Object.values(workload.networking ?? {})) {
    if (net.type !== "gateway") continue;
    for (const route of net.routes) {
      if (
        KitSdk.Deploy.isReference(route.target) &&
        route.target.category === "compute"
      ) {
        names.add(route.target.name);
      }
    }
  }
  return names;
}

/** Walks `batches`, translating every entry into the shared `ComposeDocument`, threading each entry's output into `outputs` for downstream entries/compute to consume. Returns the config files (Caddyfiles, garage.toml) keyed by volume-relative path. */
function buildComposeDocument(
  workload: KitSdk.Deploy.Workload,
  batches: KitSdk.Deploy.BatchEntry[][],
  projectName: string,
  repoRoot: string,
  artifactsPath: string,
  version: string,
  development: boolean,
): { doc: ComposeDocument; configFiles: Map<string, string> } {
  const doc = newComposeDocument(projectName);
  const outputs = new Map<string, Record<string, string>>();
  const configFiles = new Map<string, string>();
  const gatewayTargets = gatewayTargetComputeNames(workload);

  for (const batch of batches) {
    for (const entry of batch) {
      if (entry.category === "compute") {
        const spec = workload.compute![entry.name];
        if (UNSUPPORTED_COMPUTE_KINDS.has(spec.type)) {
          throw new Error(
            `compose kit doesn't support compute "${entry.name}" of type "${spec.type}" — only container-orchestrated and container-serverless map onto a Compose service.`,
          );
        }
        const containerSpec = spec as
          | KitSdk.Deploy.ContainerOrchestrated
          | KitSdk.Deploy.ContainerServerless;
        doc.services[entry.name] = translateContainerCompute(
          workload,
          containerSpec,
          outputs,
          artifactsPath,
          doc,
          development,
          !gatewayTargets.has(entry.name),
        );
        outputs.set(
          `compute.${entry.name}`,
          Object.fromEntries(
            Object.entries(containerSpec.ports ?? {}).map((
              [name, port],
            ) => [name, `http://${entry.name}:${port}`]),
          ),
        );
        continue;
      }

      if (entry.category === "databases") {
        const spec = workload.databases![entry.name];
        const relationalInputs = spec.type === "relational"
          ? {
            user: resolveReferenceable(spec.user ?? "ensemble", outputs) ??
              "ensemble",
            database:
              resolveReferenceable(spec.database ?? entry.name, outputs) ??
                entry.name,
            passwordSecret: spec.passwordSecret,
            initMounts: (spec.init ?? []).map((path) =>
              `${
                join(repoRoot, path)
              }:/docker-entrypoint-initdb.d/${basename(path)}:ro`
            ),
          }
          : undefined;
        const { service, output } = translateDatabase(
          entry.name,
          spec,
          relationalInputs,
        );
        doc.services[entry.name] = service;
        outputs.set(`databases.${entry.name}`, output);
      }

      if (entry.category === "storage") {
        const spec = workload.storage![entry.name];
        const { service, output, config } = translateStorage(entry.name, spec);
        if (spec.type === "file-storage") {
          ensureVolumeDeclared(doc, entry.name);
        } else if (service) {
          doc.services[entry.name] = service;
          // object-storage (Garage) keeps its meta+data on named volumes so
          // its one-off bootstrap (buckets/keys) survives `down`.
          ensureVolumeDeclared(doc, `${entry.name}-meta`);
          ensureVolumeDeclared(doc, `${entry.name}-data`);
          if (config) configFiles.set(`garage/${entry.name}.toml`, config);
        }
        outputs.set(`storage.${entry.name}`, output);
      }

      if (entry.category === "messaging") {
        const spec = workload.messaging![entry.name];
        const { service, output } = translateMessaging(entry.name, spec);
        doc.services[entry.name] = service;
        outputs.set(`messaging.${entry.name}`, output);
      }

      if (entry.category === "networking") {
        const spec = workload.networking![entry.name];
        const originUrl = spec.type === "cdn"
          ? resolveReferenceable(spec.origin, outputs)
          : undefined;
        const routeTargets = spec.type === "gateway"
          ? spec.routes.map((route) => ({
            host: route.host,
            match: route.path.match,
            target: resolveReferenceable(route.target, outputs),
            strip: route.path.strip,
          }))
          : undefined;
        const { service, caddyfile, output } = translateNetworking(
          entry.name,
          spec,
          originUrl,
          routeTargets,
        );
        if (service) {
          doc.services[entry.name] = service;
          if (spec.type !== "dns") {
            const networks = resolveServiceNetworks(
              spec.network,
              outputs,
              doc,
              development,
            );
            if (networks) service.networks = networks;
          }
        }
        if (caddyfile) {
          configFiles.set(`caddy/${entry.name}.Caddyfile`, caddyfile);
          service!.volumes = [
            ...(service!.volumes ?? []),
            `./caddy/${entry.name}.Caddyfile:/etc/caddy/Caddyfile:ro`,
          ];
        }
        outputs.set(`networking.${entry.name}`, output);
      }

      if (entry.category === "external") {
        const spec = workload.external![entry.name];
        const { output } = translateExternal(spec);
        outputs.set(`external.${entry.name}`, output);
      }

      if (entry.category === "secrets") {
        const spec = workload.secrets![entry.name];
        const { output } = translateSecret(entry.name, spec);
        // An env-sourced secret's value is read by Compose itself from the
        // env var named after the secret (presence guaranteed by
        // requireSecrets); a file-sourced one from a local file the pipeline
        // placed. Either way it reaches a service only as a mounted file at
        // ${secrets.<name>.path} — never as a plain container env var.
        doc.secrets[entry.name] = spec.source === "environment"
          ? { environment: entry.name }
          : { file: `./secrets/${entry.name}` };
        outputs.set(`secrets.${entry.name}`, output);
      }

      if (entry.category === "variables") {
        // Value presence is guaranteed by requireVariables, run before this walk.
        const { output } = translateVariable(Deno.env.get(entry.name)!);
        outputs.set(`variables.${entry.name}`, output);
      }

      if (entry.category === "release") {
        const spec = workload.release![entry.name];
        outputs.set(`release.${entry.name}`, {
          image: releaseImageTag(entry.name, spec, version, development),
        });
      }
    }
  }

  return { doc, configFiles };
}

/**
 * Fails clearly (rather than silently proceeding, or emitting an empty env
 * value) if any declared `variables` entry has no value in the deploy
 * process's environment. Placing each declared variable there — by exporting
 * it or loading an env file before invoking `ens deploy` — is the job of
 * whatever pipeline runs the deploy.
 */
function requireVariables(workload: KitSdk.Deploy.Workload): void {
  const missing = Object.keys(workload.variables ?? {}).filter(
    (name) => Deno.env.get(name) === undefined,
  );
  if (missing.length > 0) {
    throw new Error(
      `Variable(s) declared but not set in the environment: ${
        missing.join(", ")
      } — export them (or load an env file) before running ens deploy.`,
    );
  }
}

/**
 * Fails clearly (rather than silently proceeding) if any declared `secrets`
 * entry has no value where its `source` says to find it: a file-sourced
 * secret needs a file under `<volumePath>/secrets/`; an env-sourced one needs
 * the env var named after it set in the deploy process's environment (which
 * Compose itself reads at `up` time). Placing either is the pipeline's job.
 */
async function requireSecrets(
  workload: KitSdk.Deploy.Workload,
  volumePath: string,
): Promise<void> {
  for (const [name, spec] of Object.entries(workload.secrets ?? {})) {
    if (spec.source === "environment") {
      if (Deno.env.get(name) === undefined) {
        throw new Error(
          `Secret "${name}" is declared (source: environment) but env var "${name}" isn't set — export it before running ens deploy.`,
        );
      }
      continue;
    }
    const path = join(volumePath, "secrets", name);
    if (!await exists(path, { isFile: true })) {
      throw new Error(
        `Secret "${name}" is declared but has no local value — create ${path} with its local dev value first.`,
      );
    }
  }
}

/**
 * Fails clearly (rather than letting `docker compose up` fall through to
 * Docker's own pull/resolution, which can silently pick up an unrelated
 * stale image under the same tag) if any container compute entry's `image`
 * is a `${release.<name>...}` reference whose resolved tag isn't present in
 * the local image store — i.e. `ens pack` hasn't been run yet for that
 * version. Development-only: a production deploy resolves computes to their
 * published references and lets the target pull them, so there's no local
 * image to require.
 */
async function requireReleaseImages(
  workload: KitSdk.Deploy.Workload,
  version: string,
): Promise<void> {
  for (const [name, compute] of Object.entries(workload.compute ?? {})) {
    if (
      compute.type !== "container-orchestrated" &&
      compute.type !== "container-serverless"
    ) continue;
    if (
      !KitSdk.Deploy.isReference(compute.image) ||
      compute.image.category !== "release"
    ) continue;
    const releaseName = compute.image.name;
    const entry = workload.release?.[releaseName];
    if (!entry) continue; // buildBatches' validateReferences already caught a truly dangling reference
    // This gate only runs for development deploys (see call site), where the
    // image is the local packed tag — so resolve it in development mode.
    const tag = releaseImageTag(releaseName, entry, version, true);
    const result = await $`docker image inspect ${tag}`.quiet().noThrow();
    if (result.code !== 0) {
      const packCmd = `ens pack ${releaseName} ${entry.kit}${
        entry.mode ? ` --mode ${entry.mode}` : ""
      }`;
      const hint = version === "latest"
        ? `run \`${packCmd}\` first.`
        : `if you expect it to exist locally, pull/load it first; to build and publish it, run \`ens release next\`/\`set\` once that's supported.`;
      throw new Error(
        `compute "${name}" references release "${releaseName}" at version "${version}" (image "${tag}"), but no local image exists under that tag — ${hint}`,
      );
    }
  }
}

const kit = new KitSdk.Deploy.Kit();

kit.Configure(
  async (workload, batches, options, ctx) => {
    requireVariables(workload);
    await requireSecrets(workload, ctx.volumePath);
    // Only a development deploy runs the locally packed image, so only then
    // does it make sense to require that image to exist locally. A production
    // deploy resolves computes to their published references and lets the
    // target pull them — ens does not gate on the local store.
    if (options.development) {
      await requireReleaseImages(workload, options.version);
    }

    const { doc, configFiles } = buildComposeDocument(
      workload,
      batches,
      ctx.name,
      ctx.repoRoot,
      ctx.artifactsPath,
      options.version,
      options.development,
    );
    await ensureDir(ctx.volumePath);
    await Deno.writeTextFile(
      join(ctx.volumePath, "compose.yaml"),
      stringifyYaml(doc as unknown as Record<string, unknown>),
    );

    // Each key is a volume-relative path (e.g. "caddy/gw.Caddyfile",
    // "garage/store.toml") a service bind-mounts — written here alongside the
    // compose file.
    for (const [relPath, content] of configFiles) {
      const abs = join(ctx.volumePath, relPath);
      await ensureDir(dirname(abs));
      await Deno.writeTextFile(abs, content);
    }

    const watchArgs = options.watch ? ["--watch"] : ["-d"];
    const result = await $`docker compose -f compose.yaml up ${watchArgs}`.cwd(
      ctx.volumePath,
    ).noThrow();
    if (result.code !== 0) {
      throw new Error(`docker compose up exited with code ${result.code}`);
    }
  },
  async (_workload, _batches, _options, ctx) => {
    const composePath = join(ctx.volumePath, "compose.yaml");
    if (!await exists(composePath, { isFile: true })) return;
    const result = await $`docker compose -f compose.yaml down`.cwd(
      ctx.volumePath,
    ).noThrow();
    if (result.code !== 0) {
      throw new Error(`docker compose down exited with code ${result.code}`);
    }
  },
);

export default kit;
