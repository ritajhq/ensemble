import type { Icon } from "./icons.ts";

/** An entry's identity: its `deploy` category and its name there, as `compute.platform`. */
export type Id = string;

/** One fact about an entry worth showing beside its name. */
export interface Detail {
  readonly label: string;
  readonly value: string;
}

/** One piece of a manifest's `deploy` block, with what a renderer needs to draw it. */
export interface Entry {
  readonly id: Id;
  readonly category: string;
  readonly name: string;
  /** The resource's `type`; for a secret its `source`, and for a variable its `type` (`string` unless stated). */
  readonly type: string;
  readonly icon: Icon;
  /** The row of the architecture it sits in: 0 needs nothing rendered first, each later one something in an earlier one. A compute naming another's address needs nothing of it, so computes are in one row however they refer to each other. */
  readonly layer: number;
  readonly description?: string;
  readonly details: readonly Detail[];
}

/** `from` uses `to`, through the field `via` of `from`. `to` is an `Entry`'s id, except for a release (`release.<name>`), which `show deploy` leaves out of its entries. */
export interface Relation {
  readonly from: Id;
  readonly to: Id;
  readonly via: string;
}

/**
 * What a manifest's `deploy` block declares, with every
 * reference resolved to the entry it names. Renderer-agnostic: an SVG
 * drawing, a text tree, or anything else reads it without going back to the
 * manifest.
 */
export class Architecture {
  constructor(
    readonly entries: readonly Entry[],
    readonly relations: readonly Relation[],
  ) {}
}
