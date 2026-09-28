import type { OutputsLedger } from "../render/outputs-ledger.ts";

/**
 * Told what a deployment is once it's actually up — after a successful
 * apply, or once a watch session has started — so what the render produced
 * can be kept for later use against that running deployment (`ens delivery
 * task` resolving its arguments from it, rather than rendering again).
 */
export interface DeployedState {
  record(ledger: OutputsLedger, artifactPath: string): Promise<void>;
}
