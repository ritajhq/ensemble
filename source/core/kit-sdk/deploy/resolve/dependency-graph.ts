import { CATEGORIES, type Workload } from "../workload.ts";
import { type Reference, ReferenceSyntax } from "../reference.ts";

/** One node's identity in the graph — a deploy resource in some `Category`, or a sibling `release` entry (Section 12: releases are producers too). */
export interface ResourceId {
  readonly category: string;
  readonly name: string;
}

/** Raised when a reference points at a resource that isn't declared anywhere in the workload, or when the reference graph has a cycle. */
export class DependencyGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DependencyGraphError";
  }
}

/**
 * The dependency-ordered structure a `Renderer` (Phase 5) walks to resolve
 * references and drive provisioners: groups ("batches") of resources with no
 * dependency on one another, ordered so every batch's dependencies were
 * already resolved in an earlier batch. Also answers, for one resource, which
 * others it directly depends on — a kit that orders its own apply step from
 * reference edges (compose's `depends_on`, Section 8) needs that per-resource
 * view, not just the batch grouping.
 */
export class DependencyGraph {
  constructor(
    private readonly orderedBatches: readonly ResourceId[][],
    private readonly edges: ReadonlyMap<string, ReadonlySet<string>>,
    private readonly byKey: ReadonlyMap<string, ResourceId>,
  ) {}

  batches(): readonly ResourceId[][] {
    return this.orderedBatches;
  }

  /** The resources `id` directly references — not transitive, and in no particular order (a kit that cares about order, e.g. for deterministic `depends_on`, should sort it). */
  dependenciesOf(id: ResourceId): readonly ResourceId[] {
    const dependencies = this.edges.get(`${id.category}.${id.name}`) ??
      new Set();
    return [...dependencies].map((key) => this.byKey.get(key)!);
  }
}

/**
 * Builds a `DependencyGraph` from a workload's reference edges. Deliberately
 * narrower in one sense and broader in another than Phase 2's
 * `ReferenceValidator`: it doesn't check that a reference's output key is
 * contractually valid (that's `ReferenceValidator`'s job), but it does check
 * that the referenced resource exists at all (Phase 2's validator does too,
 * for its own purpose — a small, deliberate overlap between two checks with
 * different jobs, not one doing the other's work) and additionally detects
 * cycles, which only a whole-graph view can do.
 */
export class DependencyGraphBuilder {
  constructor(
    private readonly syntax: ReferenceSyntax = new ReferenceSyntax(),
  ) {}

  build(workload: Workload): DependencyGraph {
    const nodes = this.collectNodes(workload);
    const nodeKeys = new Set(nodes.map((node) => this.key(node)));
    const edges = this.collectEdges(workload, nodeKeys);
    const byKey = new Map(nodes.map((node) => [this.key(node), node]));
    return new DependencyGraph(
      this.topologicalBatches(nodes, edges),
      edges,
      byKey,
    );
  }

  private key(id: ResourceId): string {
    return `${id.category}.${id.name}`;
  }

  private collectNodes(workload: Workload): ResourceId[] {
    const nodes: ResourceId[] = [];
    for (const name of Object.keys(workload.release ?? {})) {
      nodes.push({ category: "release", name });
    }
    for (const category of CATEGORIES) {
      const resources = workload[category] as
        | Record<string, unknown>
        | undefined;
      for (const name of Object.keys(resources ?? {})) {
        nodes.push({ category, name });
      }
    }
    return nodes;
  }

  private collectEdges(
    workload: Workload,
    nodeKeys: Set<string>,
  ): Map<string, Set<string>> {
    const edges = new Map<string, Set<string>>();
    for (const name of Object.keys(workload.release ?? {})) {
      edges.set(this.key({ category: "release", name }), new Set());
    }

    for (const category of CATEGORIES) {
      const resources =
        (workload[category] as Record<string, unknown> | undefined) ?? {};
      for (const [name, resource] of Object.entries(resources)) {
        const from = this.key({ category, name });
        const dependencies = new Set<string>();
        this.forEachReference(resource, (reference) => {
          const to = this.key({
            category: reference.category,
            name: reference.name,
          });
          if (!nodeKeys.has(to)) {
            throw new DependencyGraphError(
              `${from} references undeclared resource "${to}".`,
            );
          }
          dependencies.add(to);
        });
        edges.set(from, dependencies);
      }
    }
    return edges;
  }

  private forEachReference(
    resource: unknown,
    onReference: (reference: Reference) => void,
  ): void {
    const params = (resource as { params?: Record<string, unknown> }).params;
    if (!params) return;
    for (const value of Object.values(params)) {
      this.visitValue(value, onReference);
    }
  }

  private visitValue(
    value: unknown,
    onReference: (reference: Reference) => void,
  ): void {
    const reference = this.syntax.parse(value);
    if (reference) {
      onReference(reference);
      return;
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        this.visitValue(nested, onReference);
      }
    }
  }

  /** Kahn's algorithm: repeatedly peels off the set of nodes with no unresolved dependency into the next batch. Any nodes left once nothing is ready are a cycle. Sorted per batch for determinism (G5) — `Set`/`Map` iteration order is insertion-order in JS, but sorting makes that guarantee explicit rather than incidental. */
  private topologicalBatches(
    nodes: ResourceId[],
    edges: Map<string, Set<string>>,
  ): ResourceId[][] {
    const byKey = new Map(nodes.map((node) => [this.key(node), node]));
    const remaining = new Map(
      [...edges].map(([key, deps]) => [key, new Set(deps)]),
    );
    const batches: ResourceId[][] = [];

    while (remaining.size > 0) {
      const ready = [...remaining.entries()]
        .filter(([, deps]) => deps.size === 0)
        .map(([key]) => key)
        .sort();

      if (ready.length === 0) {
        throw new DependencyGraphError(
          `Cycle detected among: ${[...remaining.keys()].sort().join(", ")}.`,
        );
      }

      batches.push(ready.map((key) => byKey.get(key)!));
      for (const key of ready) remaining.delete(key);
      for (const deps of remaining.values()) {
        for (const key of ready) deps.delete(key);
      }
    }
    return batches;
  }
}
