import * as KitSdk from "@ensemble/kit-sdk";
import { pascalCase } from "../pascal-case.ts";

/** `container-orchestrated.v1`'s `env` map, as ECS's own `[{Name, Value}]` array shape. */
function containerEnvironment(
  env: unknown,
): Array<{ Name: string; Value: unknown }> {
  if (typeof env !== "object" || env === null) return [];
  return Object.entries(env as Record<string, unknown>).map((
    [Name, Value],
  ) => ({ Name, Value }));
}

/**
 * Fulfills `container-orchestrated` on aws as `AWS::ECS::TaskDefinition`.
 * `replicas` has no equivalent on a bare task definition (that's an ECS
 * *service*'s `DesiredCount`, a resource this contract doesn't model) — left
 * unrendered, same call compose made for its own reason. Declares no
 * outputs, matching `container-orchestrated.v1`'s contract exactly (Section
 * 6 — the `Renderer` now enforces this).
 */
export function containerOrchestratedProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    matches: (resource) =>
      resource.declaration.type === "container-orchestrated",
    describe: () => "container-orchestrated (AWS::ECS::TaskDefinition)",
    provision: (request) => ({
      fragment: {
        category: request.category,
        name: request.name,
        content: {
          resources: {
            [`${pascalCase(request.name)}Task`]: {
              Type: "AWS::ECS::TaskDefinition",
              Properties: {
                ContainerDefinitions: [
                  {
                    Name: request.name,
                    Image: request.params.image,
                    Environment: containerEnvironment(request.params.env),
                  },
                ],
              },
            },
          },
        },
      },
      outputs: {},
    }),
  };
}
