import { isReference, type Reference } from "./reference.ts";
import type { Category } from "./kind.ts";
import type { Workload } from "./workload.ts";
import type { ContainerBase, Mount } from "./compute.ts";

export class WorkloadReferenceError extends Error {}
export class WorkloadCycleError extends Error {}

/** One declared entry, identified by its category + name — the addressing scheme `Reference`s point at. */
export interface EntryId {
  category: Category;
  name: string;
}

/** One batch element — every entry, `compute` included, is a named `EntryId`. */
export type BatchEntry = EntryId;

function entryKey(id: EntryId): string {
  return `${id.category}.${id.name}`;
}

/** Every named entry a `Workload` declares, as `EntryId`s. */
function declaredEntries(workload: Workload): EntryId[] {
  const entries: EntryId[] = [];
  const addAll = (
    category: Category,
    named: Record<string, unknown> | undefined,
  ) => {
    for (const name of Object.keys(named ?? {})) {
      entries.push({ category, name });
    }
  };
  addAll("compute", workload.compute);
  addAll("storage", workload.storage);
  addAll("databases", workload.databases);
  addAll("messaging", workload.messaging);
  addAll("networking", workload.networking);
  addAll("secrets", workload.secrets);
  addAll("variables", workload.variables);
  addAll("external", workload.external);
  addAll("release", workload.release);
  return entries;
}

/** Every `(field, Reference)` pair a container-shaped compute entry's reference-capable fields (`image`, `env`, `network`) declare. */
function containerReferences(
  base: ContainerBase,
): { field: string; ref: Reference }[] {
  const refs = Object.values(base.env ?? {}).filter(isReference).map((
    ref,
  ) => ({ field: "env", ref }));
  if (isReference(base.image)) {
    refs.push({ field: "image", ref: base.image });
  }
  if (base.network && isReference(base.network)) {
    refs.push({ field: "network", ref: base.network });
  }
  return refs;
}

/** Every `Reference` one compute entry's reference-capable fields declare, alongside the entry that declared it and which field it came from (for error messages). */
function computeReferences(
  workload: Workload,
): { from: EntryId; field: string; ref: Reference }[] {
  const refs: { from: EntryId; field: string; ref: Reference }[] = [];
  for (const [name, compute] of Object.entries(workload.compute ?? {})) {
    const from: EntryId = { category: "compute", name };
    switch (compute.type) {
      case "container-orchestrated":
      case "container-serverless":
        for (const { field, ref } of containerReferences(compute)) {
          refs.push({ from, field, ref });
        }
        break;
      case "function-runtime":
      case "function-isolate":
        for (
          const ref of Object.values(compute.env ?? {}).filter(isReference)
        ) {
          refs.push({ from, field: "env", ref });
        }
        break;
      case "batch":
        for (
          const ref of Object.values(compute.env ?? {}).filter(isReference)
        ) {
          refs.push({ from, field: "env", ref });
        }
        if (isReference(compute.image)) {
          refs.push({ from, field: "image", ref: compute.image });
        }
        break;
      case "vm":
        if (isReference(compute.image)) {
          refs.push({ from, field: "image", ref: compute.image });
        }
        break;
    }
  }
  return refs;
}

/** Every `Reference` a networking entry's reference-capable fields (`cdn.origin`, `gateway.routes[].target`, `network` on any runtime-service kind) declare, alongside the entry that declared it and which field it came from (for error messages). */
function networkingReferences(
  workload: Workload,
): { from: EntryId; field: string; ref: Reference }[] {
  const refs: { from: EntryId; field: string; ref: Reference }[] = [];
  for (const [name, entry] of Object.entries(workload.networking ?? {})) {
    const from: EntryId = { category: "networking", name };
    if (entry.type === "cdn" && isReference(entry.origin)) {
      refs.push({ from, field: "origin", ref: entry.origin });
    }
    if (entry.type === "gateway") {
      for (const route of entry.routes) {
        if (isReference(route.target)) {
          refs.push({ from, field: "routes", ref: route.target });
        }
      }
    }
    if (entry.type !== "dns" && entry.network && isReference(entry.network)) {
      refs.push({ from, field: "network", ref: entry.network });
    }
  }
  return refs;
}

/** Every `(where, Reference)` pair declared anywhere in `workload`, for error messages that name the field a bad reference came from. */
function allReferencesWithLocation(
  workload: Workload,
): { where: string; ref: Reference }[] {
  const refs = computeReferences(workload).map(({ from, field, ref }) => ({
    where: `${from.category}.${from.name}.${field}`,
    ref,
  }));
  for (const { from, field, ref } of networkingReferences(workload)) {
    refs.push({ where: `${from.category}.${from.name}.${field}`, ref });
  }
  return refs;
}

/** Every compute entry's `mounts` (or `vm`'s, both share the same field), for validating each `storage` name against declared `file-storage` entries — a separate check from `Reference`s since `mounts` isn't a `${...}` placeholder, it's a plain by-name field. */
function computeMounts(workload: Workload): Mount[] {
  const mounts: Mount[] = [];
  for (const compute of Object.values(workload.compute ?? {})) {
    switch (compute.type) {
      case "container-orchestrated":
      case "container-serverless":
      case "vm":
        mounts.push(...(compute.mounts ?? []));
        break;
      case "function-runtime":
      case "function-isolate":
      case "batch":
        break;
    }
  }
  return mounts;
}

/** Validates that every `Reference` in `workload` resolves to a declared entry, and that every `compute.mounts[].storage` names a declared `file-storage` entry. */
export function validateReferences(file: string, workload: Workload): void {
  const declared = new Set(declaredEntries(workload).map(entryKey));
  for (const { where, ref } of allReferencesWithLocation(workload)) {
    const key = entryKey(ref);
    if (!declared.has(key)) {
      throw new WorkloadReferenceError(
        `${file}: ${where} references "\${${ref.category}.${ref.name}.${ref.output}}", but no ${ref.category} entry named "${ref.name}" is declared.`,
      );
    }
  }

  const fileStorageNames = new Set(
    Object.entries(workload.storage ?? {})
      .filter(([, s]) => s.type === "file-storage")
      .map(([name]) => name),
  );
  for (const mount of computeMounts(workload)) {
    if (!fileStorageNames.has(mount.storage)) {
      throw new WorkloadReferenceError(
        `${file}: compute.mounts references storage "${mount.storage}", but no file-storage entry named "${mount.storage}" is declared.`,
      );
    }
  }
}

/**
 * Builds topological batches of entries from the reference edges declared
 * across `workload` (an edge from entry A to entry B means A's spec
 * references B's output, so B must resolve before A). Each batch is a list
 * of entries whose dependencies are all satisfied by previous batches, and
 * are therefore safe to translate concurrently. Compute entries may
 * reference any other entry, including each other (e.g. a worker's `env`
 * pointing at an API's `${compute.api.address}`) — the SDK itself doesn't
 * define what a compute entry's outputs are (that's left to each kit, e.g.
 * the compose kit synthesizing an `address` per container), it only needs to
 * order entries so a referenced one resolves first. A cycle between two
 * compute entries (or through any other category) is rejected below, same as
 * any other reference cycle.
 */
export function buildBatches(file: string, workload: Workload): BatchEntry[][] {
  validateReferences(file, workload);

  const entries = declaredEntries(workload);
  const entryByKey = new Map(entries.map((e) => [entryKey(e), e]));
  const dependencies = new Map<string, Set<string>>();
  for (const entry of entries) dependencies.set(entryKey(entry), new Set());

  for (const { from, ref } of networkingReferences(workload)) {
    dependencies.get(entryKey(from))!.add(entryKey(ref));
  }
  for (const { from, ref } of computeReferences(workload)) {
    dependencies.get(entryKey(from))!.add(entryKey(ref));
  }

  const batches: BatchEntry[][] = [];
  const done = new Set<string>();
  const remainingKeys = [...dependencies.keys()];

  while (done.size < remainingKeys.length) {
    const batchKeys = remainingKeys.filter((key) =>
      !done.has(key) &&
      [...dependencies.get(key)!].every((dep) => done.has(dep))
    );
    if (batchKeys.length === 0) {
      const remaining = remainingKeys.filter((key) => !done.has(key));
      throw new WorkloadCycleError(
        `${file}: cycle detected among: ${remaining.join(", ")}`,
      );
    }
    batches.push(batchKeys.map((key) => entryByKey.get(key)!));
    for (const key of batchKeys) done.add(key);
  }

  return batches;
}
