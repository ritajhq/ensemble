import type { Workload } from "./workload.ts";
import type { Problem } from "./problem.ts";
import { Parser } from "./manifest/parser.ts";
import { ContractCatalog } from "./contracts/registry.ts";
import { SEEDED } from "./contracts/seeds/index.ts";
import { WorkloadValidator } from "./resolve/workload-validator.ts";
import {
  DependencyGraphBuilder,
  DependencyGraphError,
  type ResourceId,
} from "./resolve/dependency-graph.ts";

/**
 * Every problem in a manifest that `ens deploy` would find before it needs a
 * deploy kit: its structure, each resource against its contract, each
 * `${...}` reference, and reference cycles. Each problem names the node it's
 * about, for an editor to mark.
 */
export class ManifestCheck {
  constructor(
    private readonly parser: Parser = new Parser(),
    private readonly validator: WorkloadValidator = new WorkloadValidator(
      new ContractCatalog(SEEDED),
    ),
    private readonly graphBuilder: DependencyGraphBuilder =
      new DependencyGraphBuilder(),
  ) {}

  /** Throws the YAML parser's own error for text that isn't YAML: past a syntax error, there is no structure to check. */
  problemsOf(text: string): Problem[] {
    const { workload, problems } = this.parser.read(text);
    const contractProblems = this.validator.problemsOf(workload);
    // A cycle is only worth reporting once every reference resolves: the
    // graph stops at the first bad one, which the validator has named.
    const cycleProblems = contractProblems.length === 0
      ? this.cycleProblemsOf(workload)
      : [];
    return [...problems, ...contractProblems, ...cycleProblems];
  }

  private cycleProblemsOf(workload: Workload): Problem[] {
    try {
      this.graphBuilder.build(workload);
      return [];
    } catch (error) {
      if (!(error instanceof DependencyGraphError)) throw error;
      return error.involved.map((resource) => ({
        path: this.pathOf(resource),
        message: error.message,
      }));
    }
  }

  private pathOf(resource: ResourceId): string[] {
    if (resource.category === "release") return ["release", resource.name];
    return ["deploy", resource.category, resource.name];
  }
}
