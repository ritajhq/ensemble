import { CATEGORIES, type Category } from "../workload.ts";
import { VARIABLE_TYPES } from "../resource.ts";
import { LAUNCH_TYPES } from "../launch.ts";
import type { PathSegment } from "../problem.ts";
import { ContractCatalog } from "../contracts/registry.ts";
import { SEEDED } from "../contracts/seeds/index.ts";
import type { ResourceContract } from "../contracts/contract.ts";
import { type Key, KEYS, SECRET_SOURCES, SUPPORTED_VERSIONS } from "./keys.ts";

/** Stands for any one key in a path pattern: a name the developer chose. */
const ANY = Symbol("any key");
type Pattern = readonly (string | typeof ANY)[];

/** A path pattern and what's known at a path it matches, given the manifest's root. */
interface Rule<T> {
  readonly pattern: Pattern;
  readonly answer: (path: readonly PathSegment[], root: unknown) => T;
}

/** The categories whose entries are resources, each typed by a contract. */
const CONTRACT_FREE: readonly string[] = ["secrets", "variables", "external"];

/**
 * What a manifest may hold where — the keys of each mapping and the closed
 * set of values some scalars take — answered for an editor. The fixed keys
 * are the parser's own (`KEYS`); a resource's fields are its contract's, so
 * the answers can't drift from what `ens deploy` accepts. Where the keys are
 * names the developer chooses (a resource's name, an `env` variable), there
 * is nothing to suggest.
 */
export class Shape {
  private readonly keyRules: readonly Rule<readonly Key[]>[];
  private readonly valueRules: readonly Rule<readonly string[]>[];

  constructor(
    private readonly contracts: ContractCatalog = new ContractCatalog(SEEDED),
  ) {
    this.keyRules = [
      { pattern: [], answer: () => KEYS.envelope },
      { pattern: ["release", ANY], answer: () => KEYS.release },
      { pattern: ["release", ANY, "publish"], answer: () => KEYS.publish },
      { pattern: ["deploy"], answer: () => this.categoryKeys() },
      { pattern: ["deploy", "secrets", ANY], answer: () => KEYS.secret },
      { pattern: ["deploy", "variables", ANY], answer: () => KEYS.variable },
      { pattern: ["deploy", "external", ANY], answer: () => KEYS.external },
      {
        pattern: ["deploy", ANY, ANY],
        answer: (path, root) => this.resourceKeys(path, root),
      },
      {
        pattern: ["deploy", ANY, ANY, "capabilities"],
        answer: (path, root) => this.capabilityKeys(path, root),
      },
      { pattern: ["operations", ANY], answer: () => KEYS.operation },
      { pattern: ["launch", ANY], answer: () => KEYS.launch },
      {
        pattern: ["launch", ANY, "development"],
        answer: () => KEYS.launchDevelopment,
      },
    ];
    this.valueRules = [
      { pattern: ["version"], answer: () => SUPPORTED_VERSIONS },
      {
        pattern: ["deploy", "secrets", ANY, "source"],
        answer: () => SECRET_SOURCES,
      },
      {
        pattern: ["deploy", "variables", ANY, "type"],
        answer: () => VARIABLE_TYPES,
      },
      {
        pattern: ["deploy", ANY, ANY, "type"],
        answer: (path) => this.resourceTypes(path),
      },
      {
        pattern: ["deploy", ANY, ANY, "class"],
        answer: (path, root) => this.contractAt(path, root)?.classes ?? [],
      },
      { pattern: ["launch", ANY, "type"], answer: () => LAUNCH_TYPES },
    ];
  }

  /** The keys the mapping at `path` may hold. `root` is the manifest as far as it parses, which picks a resource's contract by its `type:`. */
  keysAt(path: readonly PathSegment[], root: unknown): readonly Key[] {
    return this.answer(this.keyRules, path, root) ?? [];
  }

  /** The values the scalar at `path` may take, where they're a closed set. */
  valuesAt(path: readonly PathSegment[], root: unknown): readonly string[] {
    return this.answer(this.valueRules, path, root) ?? [];
  }

  /** The first rule whose pattern matches answers; the more specific ones come first. */
  private answer<T>(
    rules: readonly Rule<T>[],
    path: readonly PathSegment[],
    root: unknown,
  ): T | undefined {
    const rule = rules.find(({ pattern }) => this.matches(pattern, path));
    return rule?.answer(path, root);
  }

  private matches(pattern: Pattern, path: readonly PathSegment[]): boolean {
    if (pattern.length !== path.length) return false;
    return pattern.every((segment, index) =>
      segment === ANY
        ? typeof path[index] === "string"
        : segment === path[index]
    );
  }

  private categoryKeys(): readonly Key[] {
    return CATEGORIES.map((name) => ({ name, required: false }));
  }

  private resourceKeys(
    path: readonly PathSegment[],
    root: unknown,
  ): readonly Key[] {
    if (CONTRACT_FREE.includes(path[1] as string)) return [];
    const params = this.contractAt(path, root)?.params ?? [];
    return [
      ...KEYS.resource,
      ...params.map(({ name, required }) => ({ name, required })),
    ];
  }

  private capabilityKeys(
    path: readonly PathSegment[],
    root: unknown,
  ): readonly Key[] {
    const capabilities = this.contractAt(path, root)?.capabilities ?? [];
    return capabilities.map(({ name }) => ({ name, required: false }));
  }

  private resourceTypes(path: readonly PathSegment[]): readonly string[] {
    const category = path[1] as string;
    if (CONTRACT_FREE.includes(category)) return [];
    if (!(CATEGORIES as readonly string[]).includes(category)) return [];
    return this.contracts.contractsIn(category as Category).map((contract) =>
      contract.type
    );
  }

  /** The contract of the resource `path` is in or under, by the `type:` it declares. */
  private contractAt(
    path: readonly PathSegment[],
    root: unknown,
  ): ResourceContract | undefined {
    const [, category, name] = path;
    const resource = this.at(root, ["deploy", category, name]);
    const type = (resource as { type?: unknown } | undefined)?.type;
    if (typeof type !== "string") return undefined;
    if (!(CATEGORIES as readonly string[]).includes(category as string)) {
      return undefined;
    }
    return this.contracts.contractFor(category as Category, type);
  }

  private at(root: unknown, path: readonly PathSegment[]): unknown {
    let node = root;
    for (const segment of path) {
      if (typeof node !== "object" || node === null) return undefined;
      node = (node as Record<PathSegment, unknown>)[segment];
    }
    return node;
  }
}
