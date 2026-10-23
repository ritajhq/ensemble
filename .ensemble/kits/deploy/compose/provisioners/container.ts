import * as KitSdk from "@ensemble/kit-sdk";
import { composeSecretWiring } from "../secret-wiring.ts";
import { publishedPorts } from "./published-ports.ts";
import { hostAccess } from "../host-access.ts";

/**
 * A `mounts` entry (`{ source, path, readOnly? }`, `source` already resolved
 * from its `${storage.<name>.name}` reference to the volume's own name by
 * render time) as compose's own `"SOURCE:TARGET[:ro]"` volume-mapping
 * string. `[]` when there's no `mounts` param at all.
 */
function mountVolumes(mounts: unknown): string[] {
  if (!Array.isArray(mounts)) return [];
  return (mounts as Array<
    { source: string; path: string; readOnly?: boolean }
  >).map(({ source, path, readOnly }) =>
    readOnly ? `${source}:${path}:ro` : `${source}:${path}`
  );
}

/**
 * An `envSecrets` map (`{ WEBHOOK_SECRET: "docs-webhook-secret" }`) resolved
 * into literal environment entries, each value compose's own `${VAR}`
 * interpolation placeholder via `composeSecretWiring` — same helper
 * `relational`'s `passwordSecret` already uses, generalized to any env var
 * name a compute names. `{}` when there's no `envSecrets` param, same
 * "absent, not empty" convention as `mountVolumes`.
 */
function envSecretVariables(
  envSecrets: unknown,
  secrets: Readonly<Record<string, KitSdk.Deploy.SecretDeclaration>>,
): Record<string, string> {
  if (typeof envSecrets !== "object" || envSecrets === null) return {};
  return Object.fromEntries(
    Object.entries(envSecrets as Record<string, string>).map((
      [envVar, secretName],
    ) => [envVar, composeSecretWiring(secretName, secrets)]),
  );
}

/**
 * Translates the portable `development` schema (rules grouped by action —
 * `sync` vs `sync+restart`) into compose's own `develop.watch` entries — one
 * per sync rule, `app` (an ens app identifier, e.g. "website/server")
 * becoming `path`, the manifest's own `path` (the container target) becoming
 * `target`, and the rule's group becoming compose's own `action`, matching
 * docker compose's field names one-for-one (compose's `action` accepts
 * exactly "sync"/"sync+restart" among others, the same two values ens's
 * schema uses). Every entry sets `initial_sync`: `ens develop` packs a
 * watched app's image while its companion `ens build --watch` is still
 * writing the first build, so the image can bake in a half-old output, and
 * a write that lands before `docker compose watch` attaches is never seen as
 * a change. Syncing the whole path when watch starts closes that gap.
 * `undefined` when there's no `development` param or neither
 * group has any rules (nothing to watch). Emitted unconditionally whenever
 * present — rendering doesn't know or care whether `--watch` was asked for
 * (Section 6: flag-independent).
 */
function developBlock(
  development: unknown,
): Record<string, unknown> | undefined {
  if (development === undefined) return undefined;
  const block = KitSdk.Deploy.parseDevelopmentBlock(development);
  const rules = [
    ...block.sync.map((rule) => ({ rule, action: "sync" as const })),
    ...block["sync+restart"].map((rule) => ({
      rule,
      action: "sync+restart" as const,
    })),
  ];
  if (rules.length === 0) return undefined;

  return {
    watch: rules.map(({ rule, action }) => ({
      path: rule.app,
      target: rule.path,
      action,
      initial_sync: true,
      ...(rule.ignore.length > 0 ? { ignore: [...rule.ignore] } : {}),
    })),
  };
}

/**
 * Fulfills `container` on compose: an image, its environment
 * (`env` plus any `envSecrets`, each resolved to compose's own `${VAR}`
 * interpolation placeholder), any networks it attaches to, any `mounts` as
 * service-level `volumes:` entries, and — when the resource declares one —
 * its `develop.watch` sync wiring. No `ports:` entry under `ens deploy`
 * (`hostAccess` adds ephemeral ones under `ens develop`): a compute's own
 * `ports` param is only the port the container *listens on* — reachable over
 * the compose network by name (`http://<service>:<port>`, what the gateway's
 * own `proxy_pass` and every `${compute.*}` reference resolve to) or via
 * `docker compose exec`/`docker network inspect` from the host — never
 * published to the host's own port space, where two computes that happen to
 * share a container port (this stack's three frontends and its `cover`
 * server all listen on 8000) would collide. `replicas` has no compose-native
 * equivalent outside swarm mode, so it's silently dropped rather than
 * rendered as something misleading — Appendix A's own golden output has no
 * trace of it either. It always gets `restart: always`: the container comes back
 * after a crash or a reboot. A compute has no `class`.
 * Declares no outputs (Phase 2's
 * `container.v1` contract declares none): a compute's ports are
 * referenced directly off its own `ports` param, not through a
 * provisioner-declared output.
 */
/**
 * The resource's environment plus its `development.env` additions, under
 * `ens develop` only. An addition naming a variable the resource already
 * sets is an error, not an override: development may run with more than
 * production, never with something different.
 */
function withDevelopmentEnv(
  request: KitSdk.Deploy.ResolvedRequest,
  environment: Record<string, string>,
): Record<string, string> {
  if (request.params.development === undefined) return environment;
  // A kit-sdk older than `development.env` parses no `env` at all.
  const additions = KitSdk.Deploy.parseDevelopmentBlock(
    request.params.development,
  ).env ?? {};
  const replaced = Object.keys(additions).filter((name) => name in environment);
  if (replaced.length > 0) {
    throw new Error(
      `compute.${request.name}: development.env may only add variables, but ${
        replaced.join(", ")
      } already set by env/envSecrets.`,
    );
  }
  if (request.mode !== "development") return environment;
  return { ...environment, ...additions };
}

/**
 * A `files` param (`{ path, content }` entries, each file already read by
 * core — see `container.v1`'s contract comment) as compose
 * `configs:`: one inline config per file, mounted at its path. Each config is
 * named after its content's hash, because compose reads an inline config only
 * when it creates a container: a changed file is a new config, which compose
 * recreates the container for, where the same name would keep serving the
 * old content.
 */
async function fileConfigs(
  service: string,
  files: unknown,
): Promise<{
  mounts: { source: string; target: string }[];
  configs: Record<string, { content: string }>;
}> {
  const mounts: { source: string; target: string }[] = [];
  const configs: Record<string, { content: string }> = {};
  if (!Array.isArray(files)) return { mounts, configs };
  for (
    const { path, content } of files as { path: string; content: string }[]
  ) {
    const digest = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${path}\n${content}`),
      ),
    );
    const hash = [...digest.slice(0, 6)].map((byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
    const name = `${service}-file-${hash}`;
    configs[name] = { content };
    mounts.push({ source: name, target: path });
  }
  return { mounts, configs };
}

/** The ports a compute listens on (its `ports` param, name → number), in declaration order. */
function containerPorts(ports: unknown): number[] {
  if (typeof ports !== "object" || ports === null) return [];
  return Object.values(ports as Record<string, unknown>).filter(
    (port): port is number => typeof port === "number",
  );
}

export function containerProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    // deno-lint-ignore require-await
    matches: async (resource) => resource.declaration.type === "container",
    // deno-lint-ignore require-await
    describe: async () => "container (compose service)",
    provision: async (request) => {
      const develop = developBlock(request.params.development);
      const files = await fileConfigs(request.name, request.params.files);
      const published = publishedPorts(
        request.params.publish,
        request.params.ports,
      );
      // `ens develop`'s ephemeral host ports cover what isn't published
      // explicitly; a port the manifest published is not also given a second,
      // random mapping.
      const ephemeral = hostAccess(
        request,
        containerPorts(request.params.ports).filter((port) =>
          !published.containerPorts.includes(port)
        ),
      ).ports ?? [];
      const hostPorts = [...published.entries, ...ephemeral];
      return {
        fragment: {
          category: request.category,
          name: request.name,
          content: {
            service: {
              image: request.params.image,
              environment: withDevelopmentEnv(request, {
                ...(request.params.env as Record<string, string> ?? {}),
                ...envSecretVariables(
                  request.params.envSecrets,
                  request.secrets,
                ),
              }),
              ...(request.params.networks
                ? { networks: request.params.networks }
                : {}),
              ...(request.params.mounts
                ? { volumes: mountVolumes(request.params.mounts) }
                : {}),
              ...(develop ? { develop } : {}),
              ...(hostPorts.length > 0 ? { ports: hostPorts } : {}),
              ...(files.mounts.length > 0 ? { configs: files.mounts } : {}),
              restart: "always",
            },
            ...(files.mounts.length > 0 ? { configs: files.configs } : {}),
          },
        },
        outputs: {},
      };
    },
  };
}
