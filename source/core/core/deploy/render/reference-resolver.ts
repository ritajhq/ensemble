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

  async resolve(
    reference: Reference,
    ledger: OutputsLedger,
  ): Promise<ResolvedReference> {
    if (reference.category === "release") {
      return { mode: "baked", value: ledger.releaseOutput(reference.name) };
    }

    const category = reference.category as Category;
    const output = reference.output!;

    // A compute's ports are developer-declared data, not a provisioner
    // output (container-orchestrated.v1's own contract comment) — resolved
    // straight off the ledger's port record, same as ReferenceValidator.
    // hasPort's schema-level check of the same data, and always baked: a
    // port number is known at manifest-parse time, never provisioner-
    // dependent wiring.
    if (
      category === "compute" && ledger.hasPort(category, reference.name, output)
    ) {
      return {
        mode: "baked",
        value: ledger.portFor(category, reference.name, output),
      };
    }

    const type = ledger.typeOf(category, reference.name);
    const value = ledger.outputFor(category, reference.name, output);
    const knowability = await this.realization.knowabilityOf(
      category,
      type,
      output,
    );

    return knowability === "static"
      ? { mode: "baked", value }
      : { mode: "deferred", wiring: value };
  }
}
