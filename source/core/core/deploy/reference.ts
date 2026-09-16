/**
 * A parsed `${category.name.output}` reference, or its `${release.name}` sugar
 * (which targets the release's primary output — `output` is left undefined for
 * that shorthand, since a release's primary output has no name to state).
 * Domain-agnostic: `category` can be any `Category` or the sibling `"release"`,
 * so a reference targets any producer's declared output — a deploy resource
 * today, a pack release already, and any future producer without a grammar
 * change.
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
 * Parses the `${...}` reference grammar out of a raw manifest field value. A
 * field is either a literal value or, in its entirety, a single reference —
 * this does not (yet) support a reference embedded inside a larger string.
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
    if (category === "release") {
      if (segments.length !== 2) {
        throw new ReferenceSyntaxError(
          `"${raw}" is not a valid reference (expected \${release.<name>}).`,
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
}
