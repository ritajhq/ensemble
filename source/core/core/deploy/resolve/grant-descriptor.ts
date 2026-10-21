import { type Reference, ReferenceSyntax } from "../reference.ts";
import type { MatchedResource } from "./matched-resource.ts";
import type { ProvisioningRequest } from "./provisioning-request.ts";

/** Two granted resources whose names become the same environment variable name, or a variable the function's own `env` already sets. */
export class GrantDescriptorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GrantDescriptorError";
  }
}

const PREFIX = "ENSEMBLE_RESOURCE";
const LIST = "ENSEMBLE_RESOURCES";

/** The part of an environment variable name that stands for a resource: its name, uppercased, every run of other characters one underscore (`editor-site` → `EDITOR_SITE`). */
export function envIdOf(resourceName: string): string {
  return resourceName.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/** An output's part of a variable name: `publicUrl` → `PUBLIC_URL`. */
export function envOutputOf(output: string): string {
  return output.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

/**
 * Describes to a function the resources it's granted — the tables and buckets
 * it lists — in its own environment, so its code finds each by name and learns
 * what it is without the manifest being repeated in it:
 *
 *   ENSEMBLE_RESOURCES=experiences,files
 *   ENSEMBLE_RESOURCE_EXPERIENCES_TYPE=key-value
 *   ENSEMBLE_RESOURCE_EXPERIENCES_ENGINE=dynamodb
 *   ENSEMBLE_RESOURCE_EXPERIENCES_NAME=…
 *   ENSEMBLE_RESOURCE_FILES_PUBLIC_URL=…
 *
 * One variable per output the resource's contract declares, each the whole
 * `${category.name.output}` reference — so every kit renders it the way it
 * renders any reference, a baked value or its own wiring — rather than one
 * structured value, which a kit couldn't assemble out of wiring that has no
 * string form. The convention is plain data any code can read; nothing
 * here asks for a library.
 */
export class GrantDescriptor {
  constructor(
    private readonly syntax: ReferenceSyntax = new ReferenceSyntax(),
  ) {}

  /** `request`, with the description added to its `env` when it's a function with grants; any other request unchanged. */
  describe(
    request: ProvisioningRequest,
    matches: ReadonlyMap<string, MatchedResource>,
  ): ProvisioningRequest {
    if (request.category !== "compute" || request.type !== "function") {
      return request;
    }
    const granted = this.granted(request, matches);
    if (granted.length === 0) return request;

    const env = request.params.env;
    if (
      env !== undefined &&
      (typeof env !== "object" || env === null || Array.isArray(env))
    ) return request;

    const described = this.entries(request, granted);
    const clashes = Object.keys(described).filter((name) =>
      name in ((env as Record<string, unknown> | undefined) ?? {})
    );
    if (clashes.length > 0) {
      throw new GrantDescriptorError(
        `compute.${request.name}: env sets ${
          clashes.join(", ")
        }, which describe the resources it's granted — rename them.`,
      );
    }
    return {
      ...request,
      params: {
        ...request.params,
        env: { ...(env as Record<string, unknown> | undefined), ...described },
      },
    };
  }

  /** The resources a function's `tables` and `buckets` grant, once each, in the order written. */
  private granted(
    request: ProvisioningRequest,
    matches: ReadonlyMap<string, MatchedResource>,
  ): MatchedResource[] {
    const found = new Map<string, MatchedResource>();
    for (const list of [request.params.tables, request.params.buckets]) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        const reference = this.referenceOf(item);
        const key = reference && `${reference.category}.${reference.name}`;
        const resource = key === undefined ? undefined : matches.get(key);
        if (key !== undefined && resource) found.set(key, resource);
      }
    }
    return [...found.values()];
  }

  private referenceOf(item: unknown): Reference | undefined {
    try {
      return this.syntax.parse(item);
    } catch {
      return undefined;
    }
  }

  private entries(
    request: ProvisioningRequest,
    granted: readonly MatchedResource[],
  ): Record<string, unknown> {
    const entries: Record<string, unknown> = {
      [LIST]: granted.map((resource) => resource.name).join(","),
    };
    const ids = new Map<string, string>();
    for (const resource of granted) {
      const id = envIdOf(resource.name);
      const taken = ids.get(id);
      if (taken !== undefined) {
        throw new GrantDescriptorError(
          `compute.${request.name}: "${taken}" and "${resource.name}" are both ${PREFIX}_${id}_… in its environment — rename one.`,
        );
      }
      ids.set(id, resource.name);
      entries[`${PREFIX}_${id}_TYPE`] = resource.declaration.type;
      for (const output of resource.contract.outputs) {
        entries[`${PREFIX}_${id}_${envOutputOf(output)}`] = this.syntax.format({
          category: resource.category,
          name: resource.name,
          output,
        });
      }
    }
    return entries;
  }
}
