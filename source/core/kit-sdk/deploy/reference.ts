import { CATEGORIES, type Category } from "./kind.ts";

/**
 * A `${<category>.<name>.<output>}` placeholder into another declared
 * entry's output — never a literal value. Only fields the schema marks as
 * reference-capable (see individual spec types) accept this; everywhere else
 * takes a plain value. Kept deliberately narrow (no expressions, no
 * arbitrary-field references) so the dependency graph is built from a known,
 * bounded set of sites rather than inferred by scanning the whole manifest —
 * see the taxonomy doc's "reference mechanism scope". `category` disambiguates
 * `name`, since names are only required unique within their own category.
 */
export interface Reference {
  category: Category;
  /** The referenced entry's `name`, unique within `category`. */
  name: string;
  /** Which of that entry's resolved outputs to substitute (e.g. "url", "connectionString"). */
  output: string;
}

const REFERENCE_PATTERN = /^\$\{([^.}]+)\.([^.}]+)\.([^.}]+)\}$/;

/** A field that's either a literal string or a `Reference` placeholder. */
export type Referenceable = string | Reference;

/** Parses a `${<category>.<name>.<output>}` string into a Reference, or undefined if `raw` isn't that shape (including an unrecognized category). */
export function parseReference(raw: string): Reference | undefined {
  const match = REFERENCE_PATTERN.exec(raw);
  if (!match) return undefined;
  const [, category, name, output] = match;
  if (!(CATEGORIES as readonly string[]).includes(category)) return undefined;
  return { category: category as Category, name, output };
}

/** True if `value` is a Reference rather than a literal. */
export function isReference(value: Referenceable): value is Reference {
  return typeof value !== "string";
}
