import { Deploy } from "@ensemble/core";
import {
  Architecture,
  type Detail,
  type Entry,
  type Id,
  type Relation,
} from "./architecture.ts";
import { Icons } from "./icons.ts";

/** What an entry is, before the relations it takes part in say which layer it sits in. */
type Described = Omit<Entry, "layer">;

/** The categories whose entries are declared in order to be used by others; every other category's entries use them. */
const PROVIDED_CATEGORIES: readonly string[] = [
  "secrets",
  "variables",
  "external",
];

/** Params whose content is too long to show beside a name, or is already shown as a relation. */
const UNSHOWN_PARAMS: readonly string[] = [
  "env",
  "envSecrets",
  "development",
  "files",
  "networks",
  "mounts",
];

/**
 * Builds the `Architecture` a workload's `deploy` block declares: an entry for
 * every piece of it, and a relation for every use one makes of another — a `${...}` reference in any of its fields,
 * or a secret named the way the contracts name them (`envSecrets` values,
 * fields ending in `Secret`).
 *
 * A reference to an undeclared entry, or a cycle, is the dependency graph's
 * to reject, and it does so before anything here runs.
 */
export class Mapper {
  /** The categories whose declarations aren't resources; every other category's are described alike. */
  private readonly describers: Readonly<
    Record<string, (name: string, declaration: unknown) => Described>
  >;

  constructor(
    private readonly icons: Icons = new Icons(),
    private readonly syntax: Deploy.ReferenceSyntax = new Deploy
      .ReferenceSyntax(),
    private readonly graphs: Deploy.Resolve.DependencyGraphBuilder = new Deploy
      .Resolve.DependencyGraphBuilder(),
  ) {
    this.describers = {
      secrets: (name, secret) =>
        this.describeSecret(name, secret as Deploy.SecretDeclaration),
      variables: (name, variable) =>
        this.describeVariable(name, variable as Deploy.VariableDeclaration),
      external: (name, external) =>
        this.describeExternal(name, external as Deploy.ExternalDeclaration),
    };
  }

  map(workload: Deploy.Workload): Architecture {
    const graph = this.graphs.build(workload);
    const described = this.describeAll(workload);
    const relations = this.relationsOf(workload);
    const layers = this.layersOf(graph, relations);

    const entries = described.map((entry): Entry => ({
      ...entry,
      layer: layers.get(entry.id) ?? 0,
    }));
    return new Architecture(entries, relations);
  }

  private describeAll(workload: Deploy.Workload): Described[] {
    const described: Described[] = [];
    for (const category of Deploy.CATEGORIES) {
      const declarations = workload[category] as
        | Record<string, unknown>
        | undefined;
      for (const [name, declaration] of Object.entries(declarations ?? {})) {
        const describe = this.describers[category] ??
          ((n: string, d: unknown) =>
            this.describeResource(
              category,
              n,
              d as Deploy.ResourceDeclaration,
            ));
        described.push(describe(name, declaration));
      }
    }
    return described;
  }

  private describeSecret(
    name: string,
    secret: Deploy.SecretDeclaration,
  ): Described {
    return {
      id: this.id("secrets", name),
      category: "secrets",
      name,
      type: secret.source,
      icon: "secret",
      description: secret.description,
      details: [],
    };
  }

  private describeVariable(
    name: string,
    variable: Deploy.VariableDeclaration,
  ): Described {
    return {
      id: this.id("variables", name),
      category: "variables",
      name,
      type: variable.type ?? "string",
      icon: "variable",
      description: variable.description,
      details: this.details({ default: variable.default }),
    };
  }

  private describeExternal(
    name: string,
    external: Deploy.ExternalDeclaration,
  ): Described {
    return {
      id: this.id("external", name),
      category: "external",
      name,
      type: external.type,
      icon: "external",
      details: this.details({ name: external.name }),
    };
  }

  private describeResource(
    category: string,
    name: string,
    declaration: Deploy.ResourceDeclaration,
  ): Described {
    return {
      id: this.id(category, name),
      category,
      name,
      type: declaration.type,
      icon: this.icons.forResource(declaration.type),
      details: [
        ...this.details({ class: declaration.class }),
        ...this.paramDetails(declaration.params),
      ],
    };
  }

  private paramDetails(params: Readonly<Record<string, unknown>>): Detail[] {
    const shown = Object.entries(params)
      .filter(([label]) => !UNSHOWN_PARAMS.includes(label))
      .map(([label, value]) => [label, this.shown(value)] as const);
    return this.details(Object.fromEntries(shown));
  }

  /** A param's value as one line of text, or nothing when it is no more than a scalar, a list of them or a mapping of them. */
  private shown(value: unknown): string | undefined {
    if (typeof value === "string") return this.withoutBraces(value);
    if (this.isScalar(value)) return String(value);
    if (Array.isArray(value) && value.every((item) => this.isScalar(item))) {
      return value.join(", ");
    }
    if (typeof value !== "object" || value === null) return undefined;
    const members = Object.entries(value);
    if (!members.every(([, member]) => this.isScalar(member))) return undefined;
    return members.map(([key, member]) => `${key}: ${member}`).join(", ");
  }

  /** A value that is one whole reference as its name alone, `release.api` for `${release.api}`: braces mean nothing to a reader. */
  private withoutBraces(value: string): string {
    return this.syntax.isWhole(value) ? value.slice(2, -1) : value;
  }

  private isScalar(value: unknown): value is string | number | boolean {
    return ["string", "number", "boolean"].includes(typeof value);
  }

  private details(
    facts: Readonly<Record<string, string | undefined>>,
  ): Detail[] {
    return Object.entries(facts)
      .filter((fact): fact is [string, string] => fact[1] !== undefined)
      .map(([label, value]) => ({ label, value }));
  }

  private relationsOf(workload: Deploy.Workload): Relation[] {
    const relations: Relation[] = [];
    for (const category of Deploy.CATEGORIES) {
      if (PROVIDED_CATEGORIES.includes(category)) continue;
      const declarations = workload[category] as
        | Record<string, Deploy.ResourceDeclaration>
        | undefined;
      for (const [name, declaration] of Object.entries(declarations ?? {})) {
        const from = this.id(category, name);
        this.collect(declaration.params, "", (to, via) => {
          if (
            relations.some((r) =>
              r.from === from && r.to === to && r.via === via
            )
          ) return;
          relations.push({ from, to, via });
        });
      }
    }
    return relations;
  }

  /** Walks `value` iteratively, reporting each entry it uses and the field path that uses it. */
  private collect(
    root: unknown,
    rootPath: string,
    onUse: (to: Id, via: string) => void,
  ): void {
    const pending: Array<[unknown, string]> = [[root, rootPath]];
    for (let next = pending.pop(); next; next = pending.pop()) {
      const [value, path] = next;
      this.referencedBy(value).forEach((to) => onUse(to, path));
      if (typeof value !== "object" || value === null) continue;
      for (const [key, member] of Object.entries(value)) {
        const memberPath = path ? `${path}.${key}` : key;
        if (this.namesSecret(path, key, member)) {
          onUse(this.id("secrets", member as string), memberPath);
        }
        pending.push([member, memberPath]);
      }
    }
  }

  private referencedBy(value: unknown): Id[] {
    const whole = this.syntax.parse(value);
    const references = whole
      ? [whole]
      : this.syntax.embedded(value).map((embedded) => embedded.reference);
    return references
      .filter((reference) => reference.category !== "deployment")
      .map((reference) => this.id(reference.category, reference.name));
  }

  /** The contracts' own convention for naming a secret: an `envSecrets` value, or a string field called `<something>Secret`. */
  private namesSecret(path: string, key: string, member: unknown): boolean {
    if (typeof member !== "string") return false;
    return path === "envSecrets" || key.endsWith("Secret");
  }

  /** A use of a compute is of its address, which needs it to be neither rendered first nor above, so it puts nothing in a row of its own. */
  private isAddress(target: Id): boolean {
    return target.startsWith("compute.");
  }

  /** Each entry sits one row below the lowest row of any entry it uses, by what it needs rendered first; a release isn't one, so using it moves nothing. */
  private layersOf(
    graph: Deploy.Resolve.DependencyGraph,
    relations: readonly Relation[],
  ): Map<Id, number> {
    const layers = new Map<Id, number>();
    const resources = graph.batches().flat();
    for (const resource of resources) {
      if (!PROVIDED_CATEGORIES.includes(resource.category)) continue;
      layers.set(this.id(resource.category, resource.name), 0);
    }
    for (const batch of graph.batches()) {
      for (const resource of batch) {
        if (resource.category === "release") continue;
        if (PROVIDED_CATEGORIES.includes(resource.category)) continue;
        const id = this.id(resource.category, resource.name);
        const used = relations
          .filter((relation) =>
            relation.from === id && !this.isAddress(relation.to)
          )
          .map((relation) => (layers.get(relation.to) ?? -1) + 1);
        layers.set(id, Math.max(0, ...used));
      }
    }
    return layers;
  }

  private id(category: string, name: string): Id {
    return `${category}.${name}`;
  }
}
