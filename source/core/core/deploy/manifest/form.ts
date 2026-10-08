import type { Workload } from "../workload.ts";
import type { VariableType } from "../resource.ts";

/**
 * One field a settings UI should render for a manifest's `deploy.variables`
 * or `deploy.secrets` entry. A `secret` field never carries a value or
 * default — secrets are sourced externally (`SecretDeclaration.source`),
 * never minted or echoed by ens.
 */
export interface FormField {
  readonly name: string;
  readonly kind: "variable" | "secret";
  /** Only set for a `variable`; absent on a `secret`. */
  readonly type?: VariableType;
  /** Only set for a `variable`; absent on a `secret`. */
  readonly default?: string;
}

/**
 * Projects a parsed `Workload`'s `deploy.variables`/`deploy.secrets` into
 * the field list a settings UI renders one input per. Pure and read-only —
 * the form is only ever as current as the manifest, because this derives
 * nothing but what `Parser` already validated; it adds no new manifest
 * concept and changes no existing one. Order is declaration order
 * (`variables` before `secrets`, each in the manifest's own key order) so a
 * UI doesn't have to invent its own.
 */
export function manifestForm(workload: Workload): FormField[] {
  const fields: FormField[] = [];

  for (const [name, variable] of Object.entries(workload.variables ?? {})) {
    fields.push({
      name,
      kind: "variable",
      type: variable.type,
      default: variable.default,
    });
  }

  for (const name of Object.keys(workload.secrets ?? {})) {
    fields.push({ name, kind: "secret" });
  }

  return fields;
}
