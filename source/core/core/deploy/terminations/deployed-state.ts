import type { Artifacts } from "../render/artifact.ts";
import type { OutputsLedger } from "../render/outputs-ledger.ts";

/**
 * Told what a deployment is once it's actually up — after a successful
 * apply, or once a watch session has started — so what the render produced
 * can be kept for later use against that running deployment (`ens delivery
 * task` resolving its arguments from it, rather than rendering again; a
 * router learning where the deployment answers).
 */
export interface DeployedState {
  record(
    ledger: OutputsLedger,
    artifactPath: string,
    artifacts: Artifacts,
  ): Promise<void>;
}

/** Several `DeployedState`s told about the same deployment, in order. */
export class DeployedStates implements DeployedState {
  private readonly states: readonly DeployedState[];

  constructor(...states: DeployedState[]) {
    this.states = states;
  }

  async record(
    ledger: OutputsLedger,
    artifactPath: string,
    artifacts: Artifacts,
  ): Promise<void> {
    for (const state of this.states) {
      await state.record(ledger, artifactPath, artifacts);
    }
  }
}
