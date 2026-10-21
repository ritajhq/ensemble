import type { ResolvedValue } from "../resolve/resolved-values.ts";
import { parseKeySchema } from "../key-schema.ts";

/** What one derived output is computed from: the resource's own resolved params and its negotiated values. */
interface Inputs {
  readonly params: Readonly<Record<string, unknown>>;
  readonly values: Readonly<Record<string, ResolvedValue>>;
}

type Derivation = (inputs: Inputs) => string | undefined;

const engine: Derivation = ({ values }) => {
  const resolved = values.engine?.value;
  return typeof resolved === "string" ? resolved : undefined;
};

/**
 * The outputs core supplies itself rather than leaving to each kit, by
 * contract (`category.type`): what follows from the manifest and the
 * negotiation alone, so every kit hands back the same thing and none
 * repeats the work. `engine` is the negotiated one — the developer's pin, or
 * the kit's default — and a key-value table's two key attributes come from
 * its `keySchema`; an absent sort key is an empty string, since an output
 * is always present.
 */
const DERIVED: Readonly<Record<string, Readonly<Record<string, Derivation>>>> =
  {
    "databases.key-value": {
      engine,
      partition: ({ params }) => parseKeySchema(params.keySchema).partition,
      sort: ({ params }) => parseKeySchema(params.keySchema).sort ?? "",
    },
    "storage.object-storage": { engine },
    "databases.relational": { engine },
  };

/** Computes the outputs of one resource that core itself provides. */
export class CoreOutputs {
  /** The derived output names of a contract, whether or not they can be computed now. */
  namesFor(contractId: string): readonly string[] {
    return Object.keys(DERIVED[contractId] ?? {});
  }

  /** The derived outputs of `contractId` that `inputs` determine; an output nothing determines is left out, for the caller to report. */
  derive(contractId: string, inputs: Inputs): Record<string, unknown> {
    const derived: Record<string, unknown> = {};
    for (
      const [name, derivation] of Object.entries(DERIVED[contractId] ?? {})
    ) {
      const value = derivation(inputs);
      if (value !== undefined) derived[name] = value;
    }
    return derived;
  }
}
