import type { Category } from "../workload.ts";
import type { Realization } from "../kit/realization.ts";
import type { Reference } from "../reference.ts";
import type { OutputsLedger } from "./outputs-ledger.ts";
import type { ResolvedReference } from "./resolved-reference.ts";

/**
 * Resolves one reference against the ledger of everything rendered so far.
 * `${release.name}` sugar is always baked (Section 12's stub locator model
 * has no notion of a dynamic release output yet); for everything else, the
 * `Realization`'s declared knowability for that output — not the raw value's
 * shape — decides baked vs. deferred (Section 8): the ledger holds whatever
 * the provisioner produced for a static output (typically a concrete value,
 * occasionally one that itself embeds the target's own unrelated
 * interpolation syntax, as compose's secret wiring does) or a dynamic one
 * (the target's native wiring representation) — either way, ens itself never
 * evaluates or interprets that value, only classifies it via knowability.
 */
export class ReferenceResolver {
  constructor(private readonly realization: Realization) {}

  resolve(reference: Reference, ledger: OutputsLedger): ResolvedReference {
    if (reference.category === "release") {
      return { mode: "baked", value: ledger.releaseOutput(reference.name) };
    }

    const category = reference.category as Category;
    const type = ledger.typeOf(category, reference.name);
    const output = reference.output!;
    const value = ledger.outputFor(category, reference.name, output);
    const knowability = this.realization.knowabilityOf(category, type, output);

    return knowability === "static"
      ? { mode: "baked", value }
      : { mode: "deferred", wiring: value };
  }
}
