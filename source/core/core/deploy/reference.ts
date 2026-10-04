import { CATEGORIES } from "./workload.ts";

/**
 * A parsed `${category.name.output}` reference, or its `${release.name}` sugar
 * (which targets the release's primary output — `output` is left undefined for
 * that shorthand, since a release's primary output has no name to state) and
 * the sibling `${deployment.<name>}` form (`../task.ts`: a deployment's own
 * identity, which is not a resource and so is resolved from the invocation
 * context rather than from the render ledger). Domain-agnostic: `category`
 * can be any `Category` or one of those siblings, so a reference targets any
 * producer's declared output — a deploy resource today, a pack release
 * already, and any future producer without a grammar change.
 */
export interface Reference {
  readonly category: string;
  readonly name: string;
  readonly output?: string;
}

/** Raised when a value has the `${...}` reference shape but its inner segments don't parse. */
export class ReferenceSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceSyntaxError";
  }
}

const REFERENCE_SHAPE = /^\$\{(.+)\}$/;

/**
 * A reference inside a larger string, recognised only when it names a
 * reference category — so `${HOME}` in a shell line, or compose's own
 * `${VAR}`, passes through as the literal it always was.
 */
const EMBEDDED_REFERENCE = new RegExp(
  `\\$\\{(?:${[...CATEGORIES, "release", "deployment"].join("|")})\\.[^}]*\\}`,
  "g",
);

/** A reference found inside a larger string, with the exact text it replaces. */
export interface EmbeddedReference {
  readonly text: string;
  readonly reference: Reference;
}

/**
 * Parses the `${...}` reference grammar out of a raw manifest field value. A
 * field is a literal value, in its entirety a single reference (`parse`), or
 * a string with references embedded in it (`embedded`) —
 * `dashboard.${variables.domain.value}`.
 * Pure syntax only: whether the referenced category/name/output actually
 * exists is a structural question answered elsewhere (contract-level output
 * checks in Phase 2's `ReferenceValidator`; full graph/cycle validation in
 * Phase 3's `DependencyGraph`).
 */
export class ReferenceSyntax {
  /** Returns the parsed `Reference`, or undefined if `raw` isn't reference-shaped at all (an ordinary literal value). Throws `ReferenceSyntaxError` if it has the `${...}` shape but its segments don't parse (e.g. wrong segment count). */
  parse(raw: unknown): Reference | undefined {
    if (typeof raw !== "string") return undefined;
    const shape = REFERENCE_SHAPE.exec(raw);
    if (!shape) return undefined;

    const segments = shape[1].split(".");
    if (segments.some((segment) => segment.length === 0)) {
      throw new ReferenceSyntaxError(
        `"${raw}" is not a valid reference (empty segment).`,
      );
    }

    const [category, name, output] = segments;
    if (category === "release" || category === "deployment") {
      if (segments.length !== 2) {
        throw new ReferenceSyntaxError(
          `"${raw}" is not a valid reference (expected \${${category}.<name>}).`,
        );
      }
      return { category, name };
    }

    if (segments.length !== 3) {
      throw new ReferenceSyntaxError(
        `"${raw}" is not a valid reference (expected \${category.name.output}).`,
      );
    }
    return { category, name, output };
  }

  /** The references embedded in `raw`, a string that isn't itself one whole reference; empty for anything else. Throws `ReferenceSyntaxError` as `parse` does for one that doesn't parse. */
  embedded(raw: unknown): EmbeddedReference[] {
    if (typeof raw !== "string" || REFERENCE_SHAPE.test(raw)) return [];
    return [...raw.matchAll(EMBEDDED_REFERENCE)].map(([text]) => ({
      text,
      reference: this.parse(text)!,
    }));
  }

  /** The inverse of `parse`: the `${...}` text that names `reference`. */
  format(reference: Reference): string {
    const segments = [reference.category, reference.name, reference.output]
      .filter((s) => s !== undefined);
    return `\${${segments.join(".")}}`;
  }
}
