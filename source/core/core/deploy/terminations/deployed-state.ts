import type { Artifacts } from "../render/artifact.ts";
import type { OutputsLedger } from "../render/outputs-ledger.ts";

/**
 * Told what a deployment is once it's actually up — after a successful
 * apply, or once a watch session has started — so what the render produced
 * can be kept for later use against that running deployment (`ens operations`
 * resolving its arguments from it, rather than rendering again; a
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

/** Runs `onUp` the first time the deployment is reported up, whatever it is told about it. */
export class UpNotice implements DeployedState {
  private told = false;

  constructor(private readonly onUp: () => void) {}

  record(): Promise<void> {
    if (this.told) return Promise.resolve();
    this.told = true;
    this.onUp();
    return Promise.resolve();
  }
}
