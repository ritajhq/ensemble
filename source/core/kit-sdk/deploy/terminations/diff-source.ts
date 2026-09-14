import type { Artifacts } from "../render/artifact.ts";
import type { DiffLine } from "./intent-diff.ts";

/** A structural diff against the target's own live reality (not against ens's local cache — that's `IntentDiff`). Reserved shape: reuses `IntentDiff`'s line-based structure so a future adapter and today's `plan` output can be presented uniformly, but nothing here is load-bearing until an adapter exists. */
export interface Diff {
  readonly lines: readonly DiffLine[];
}

/**
 * The reality-diff port (Section 4/12) — reserved, no adapter built. `plan`'s
 * intent-diff (`IntentDiffer`) compares a new render against ens's own
 * last-rendered cache, which is pure and offline; a real `DiffSource` would
 * instead ask the target itself what's actually deployed (delegating to
 * `terraform plan`, a CloudFormation change set, `kubectl diff`) — each of
 * those is a live provider read, which is exactly why it's reserved rather
 * than built now (G3: the core never reads live provider state).
 */
export interface DiffSource {
  diff(artifacts: Artifacts): Diff;
}
