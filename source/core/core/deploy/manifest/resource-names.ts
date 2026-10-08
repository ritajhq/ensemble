import type { Workload } from "../workload.ts";

/**
 * Per-environment names for a workload's shared stateful resources —
 * isolation by name on shared infrastructure, not by provisioning a new
 * instance per environment (one shared database server, one shared object
 * bucket). `databases.<name>` maps to the schema that environment should
 * use; `storage.<name>` maps to the key prefix, for entries typed
 * `object-storage` only — a `volume` entry is ephemeral and not shared, so
 * it gets no prefix.
 */
export interface ResourceNames {
  readonly databaseSchemas: Readonly<Record<string, string>>;
  readonly storagePrefixes: Readonly<Record<string, string>>;
}

const SCHEMA_SEPARATOR = "__";

/**
 * Derives the schema/prefix names one environment should use for a
 * workload's declared `databases`/`storage` resources, given a slug that
 * already identifies that environment (a sanitized branch or commit name —
 * sanitizing it is the caller's job, not this function's). Pure naming
 * only: no infra is touched and no manifest concept changes. The caller
 * feeds these names into `ens deploy` as `deploy.variables` values; this
 * function doesn't know which variable name a project's manifest uses for
 * its database/bucket name, because that mapping is project-specific.
 */
export function resolveResourceNames(
  workload: Workload,
  environmentSlug: string,
): ResourceNames {
  const databaseSchemas: Record<string, string> = {};
  for (const name of Object.keys(workload.databases ?? {})) {
    databaseSchemas[name] = `${name}${SCHEMA_SEPARATOR}${environmentSlug}`;
  }

  const storagePrefixes: Record<string, string> = {};
  for (const [name, declaration] of Object.entries(workload.storage ?? {})) {
    if (declaration.type !== "object-storage") continue;
    storagePrefixes[name] = `${environmentSlug}/`;
  }

  return { databaseSchemas, storagePrefixes };
}
