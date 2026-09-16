/** Raised when a manifest resource doesn't satisfy its contract: an unknown type, a missing/mistyped param, an unsupported class, or an unsatisfiable capability. */
export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractError";
  }
}
