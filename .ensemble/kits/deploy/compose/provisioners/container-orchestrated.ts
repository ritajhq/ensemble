import * as KitSdk from "@ensemble/kit-sdk";

/** Named ports (`{ http: 8080 }`) as compose's `"HOST:CONTAINER"` port-mapping strings — same port on both sides, since the manifest declares one number per name, not a separate host port. */
function portMappings(ports: unknown): string[] {
  if (typeof ports !== "object" || ports === null) return [];
  return Object.values(ports as Record<string, number>).map((port) =>
    `${port}:${port}`
  );
}

/**
 * A `mounts` entry (`{ source, path, readOnly? }`, `source` already resolved
 * from its `${storage.<name>.name}` reference to the volume's own name by
 * render time) as compose's own `"SOURCE:TARGET[:ro]"` volume-mapping
 * string. `[]` when there's no `mounts` param at all — same "absent, not
 * empty" convention `portMappings` uses for `ports`.
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
 * Translates the portable `development` schema (rules grouped by action —
 * `sync` vs `sync+restart`) into compose's own `develop.watch` entries — one
 * per sync rule, `app` (an ens app identifier, e.g. "website/server")
 * becoming `path`, the manifest's own `path` (the container target) becoming
 * `target`, and the rule's group becoming compose's own `action`, matching
 * docker compose's field names one-for-one (compose's `action` accepts
 * exactly "sync"/"sync+restart" among others, the same two values ens's
 * schema uses). `undefined` when there's no `development` param or neither
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
      ...(rule.ignore.length > 0 ? { ignore: [...rule.ignore] } : {}),
    })),
  };
}

/**
 * Fulfills `container-orchestrated` on compose: an image, its environment,
 * published ports, any networks it attaches to, any `mounts` as service-level
 * `volumes:` entries, and — when the resource declares one — its
 * `develop.watch` sync wiring. `replicas` has no compose-native equivalent
 * outside swarm mode, so it's silently dropped rather than rendered as
 * something misleading — Appendix A's own golden output has no trace of it
 * either. Declares no outputs (Phase 2's `container-orchestrated.v1` contract
 * declares none): a compute's ports are referenced directly off its own
 * `ports` param, not through a provisioner-declared output.
 */
export function containerOrchestratedProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    // deno-lint-ignore require-await
    matches: async (resource) =>
      resource.declaration.type === "container-orchestrated",
    // deno-lint-ignore require-await
    describe: async () => "container-orchestrated (compose service)",
    // deno-lint-ignore require-await
    provision: async (request) => {
      const develop = developBlock(request.params.development);
      return {
        fragment: {
          category: request.category,
          name: request.name,
          content: {
            service: {
              image: request.params.image,
              ...(request.params.ports
                ? { ports: portMappings(request.params.ports) }
                : {}),
              environment: request.params.env ?? {},
              ...(request.params.networks
                ? { networks: request.params.networks }
                : {}),
              ...(request.params.mounts
                ? { volumes: mountVolumes(request.params.mounts) }
                : {}),
              ...(develop ? { develop } : {}),
            },
          },
        },
        outputs: {},
      };
    },
  };
}
