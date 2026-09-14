import type { DependencyGraph } from "../resolve/dependency-graph.ts";
import type { Artifacts } from "../render/artifact.ts";
import type { Kit } from "../kit/kit.ts";
import { type IntentDiff, IntentDiffer } from "./intent-diff.ts";
import type { RenderCachePort } from "./render-cache.ts";

/**
 * `plan` (Section 9): render, compute the intent-diff against the
 * last-rendered cache, present it, stop — and update the cache to this
 * render, so the *next* plan (or apply) diffs against what was just shown,
 * not something stale. Pure/offline: the richer reality-diff (delegating to
 * the target itself) is reserved (Section 12), not built here.
 */
export class Planner {
  constructor(
    private readonly cache: RenderCachePort,
    private readonly differ: IntentDiffer = new IntentDiffer(),
  ) {}

  async plan(
    artifacts: Artifacts,
    graph: DependencyGraph,
    kit: Kit,
  ): Promise<IntentDiff> {
    const presented = kit.present(artifacts, graph);
    const previous = await this.cache.readLast();
    const diff = this.differ.diff(previous, presented.content);
    await this.cache.writeLast(presented.content);
    return diff;
  }
}
