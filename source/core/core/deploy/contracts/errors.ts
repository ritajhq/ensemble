import { describeProblems, type Problem } from "../problem.ts";

/** Raised when a manifest's resources don't satisfy their contracts: an unknown type, a missing/mistyped param, an unsupported class, an undeclared capability, or a reference to something undeclared. Carries every problem found; the message lists them one per line. */
export class ContractError extends Error {
  constructor(readonly problems: readonly Problem[]) {
    super(describeProblems(problems));
    this.name = "ContractError";
  }
}
