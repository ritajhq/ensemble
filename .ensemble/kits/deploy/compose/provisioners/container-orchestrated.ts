import * as KitSdk from "@ensemble/kit-sdk";

/** Named ports (`{ http: 8080 }`) as compose's `"HOST:CONTAINER"` port-mapping strings — same port on both sides, since the manifest declares one number per name, not a separate host port. */
function portMappings(ports: unknown): string[] {
  if (typeof ports !== "object" || ports === null) return [];
  return Object.values(ports as Record<string, number>).map((port) =>
    `${port}:${port}`
  );
}

/**
 * Fulfills `container-orchestrated` on compose: an image, its environment,
 * and published ports. `replicas` has no compose-native equivalent outside
 * swarm mode, so it's silently dropped rather than rendered as something
 * misleading — Appendix A's own golden output has no trace of it either.
 * Declares no outputs (Phase 2's `container-orchestrated.v1` contract
 * declares none): a compute's ports are referenced directly off its own
 * `ports` param, not through a provisioner-declared output.
 */
export function containerOrchestratedProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    matches: (resource) =>
      resource.declaration.type === "container-orchestrated",
    describe: () => "container-orchestrated (compose service)",
    provision: (request) => ({
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
          },
        },
      },
      outputs: {},
    }),
  };
}
