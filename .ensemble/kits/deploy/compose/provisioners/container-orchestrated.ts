import * as KitSdk from "@ensemble/kit-sdk";

/** Named ports (`{ http: 8080 }`) as compose's `"HOST:CONTAINER"` port-mapping strings — same port on both sides, since the manifest declares one number per name, not a separate host port. */
function portMappings(ports: unknown): string[] {
  if (typeof ports !== "object" || ports === null) return [];
  return Object.values(ports as Record<string, number>).map((port) =>
    `${port}:${port}`
  );
}

/**
 * Translates the portable `development.sync` schema into compose's own
 * `develop.watch` entries — one per sync rule, `app` (an ens app identifier,
 * e.g. "website/server") becoming `path` and the manifest's own `path`
 * (the container target) becoming `target`, matching docker compose's own
 * field names. `undefined` when there's no `development` param or its
 * `sync` list is empty (nothing to watch). Emitted unconditionally whenever
 * present — rendering doesn't know or care whether `--watch` was asked for
 * (Section 6: flag-independent).
 */
function developBlock(
  development: unknown,
): Record<string, unknown> | undefined {
  if (development === undefined) return undefined;
  const block = KitSdk.Deploy.parseDevelopmentBlock(development);
  if (block.sync.length === 0) return undefined;

  return {
    watch: block.sync.map((rule) => ({
      path: rule.app,
      target: rule.path,
      action: rule.action,
      ...(rule.ignore.length > 0 ? { ignore: [...rule.ignore] } : {}),
    })),
  };
}

/**
 * Fulfills `container-orchestrated` on compose: an image, its environment,
 * published ports, any networks it attaches to, and — when the resource
 * declares one — its `develop.watch` sync wiring. `replicas` has no
 * compose-native equivalent outside swarm mode, so it's silently dropped
 * rather than rendered as something misleading — Appendix A's own golden
 * output has no trace of it either. Declares no outputs (Phase 2's
 * `container-orchestrated.v1` contract declares none): a compute's ports are
 * referenced directly off its own `ports` param, not through a
 * provisioner-declared output.
 */
export function containerOrchestratedProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    matches: (resource) =>
      resource.declaration.type === "container-orchestrated",
    describe: () => "container-orchestrated (compose service)",
    provision: (request) => {
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
              ...(develop ? { develop } : {}),
            },
          },
        },
        outputs: {},
      };
    },
  };
}
