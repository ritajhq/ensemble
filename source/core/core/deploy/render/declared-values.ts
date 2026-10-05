import type { Reference } from "../reference.ts";
import type { Workload } from "../workload.ts";
import type { VariableDeclaration } from "../resource.ts";

export class DeclaredValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeclaredValueError";
  }
}

/**
 * The values a manifest declares outright rather than a render producing
 * them: `variables` and `external` entries. Resolving them needs only the
 * workload and `ens`'s own environment — no kit, no render — which is what
 * lets `ens delivery task` resolve them without rendering anything, the same
 * way `Renderer` does inside a render. Trusts `ReferenceValidator` already
 * confirmed the entry exists and the field is valid.
 */
export class DeclaredValues {
  /** Whether `reference` is one of these, not a render's. */
  covers(reference: Reference): boolean {
    return reference.category === "variables" ||
      reference.category === "external";
  }

  resolve(reference: Reference, workload: Workload): unknown {
    return reference.category === "external"
      ? this.external(reference, workload)
      : this.variable(reference, workload);
  }

  /**
   * `external` entries are manifest-declared literals, not provisioner
   * outputs (Section 5: "provisioned by nothing"). Always baked: there's no
   * provisioner in the loop for a value to ever be deferred to.
   */
  private external(reference: Reference, workload: Workload): unknown {
    const declaration = workload.external![reference.name];
    return declaration[reference.output! as "type" | "name"];
  }

  /**
   * `variables` entries are manifest-declared, provisioner-free, same as
   * `external` — but unlike a `secrets` value (which must stay opaque all
   * the way to the target's own runtime, G4), a variable's value is safe for
   * ens itself to read and bake directly into the rendered artifact
   * (Section 8: a static reference becomes its concrete baked value). Reads
   * `ens`'s own process env under the variable's name (same
   * uppercase/dash-to-underscore convention `secrets` uses), falling back to
   * the declaration's own `default`.
   */
  private variable(
    reference: Reference,
    workload: Workload,
  ): string | string[] {
    const declaration = workload.variables![reference.name];
    const raw = this.rawVariable(reference, declaration);
    if (declaration.type !== "list") return raw;
    return raw.split(",").map((entry) => entry.trim()).filter((entry) =>
      entry.length > 0
    );
  }

  /** The variable's text as supplied: process env first, then `default`. */
  private rawVariable(
    reference: Reference,
    declaration: VariableDeclaration,
  ): string {
    const envVar = reference.name.toUpperCase().replace(/-/g, "_");
    const fromEnv = Deno.env.get(envVar);
    if (fromEnv !== undefined) return fromEnv;
    if (declaration.default !== undefined) return declaration.default;

    throw new DeclaredValueError(
      `variables.${reference.name} has no value: "${envVar}" isn't set in the environment and no default is declared.`,
    );
  }
}
