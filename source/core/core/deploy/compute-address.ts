import type { Reference } from "./reference.ts";
import type { Workload } from "./workload.ts";

/**
 * What another compute needs to reach a compute: its host, and its declared
 * ports. Neither waits on the compute being rendered — a port is the
 * manifest's own number, and the host is a name the kit's realization gives
 * from the deployment's name and the compute's, not something a provisioner
 * produces. That is what lets two computes name each other, which a reference
 * that has to wait for its target would never allow, and why naming one's
 * address is no reason for the other to be brought up first.
 */
export class ComputeAddress {
  /** The output a compute's host is referenced by: `${compute.<name>.host}`. */
  static readonly HOST = "host";

  /** Whether `reference` names a compute's host or one of its declared ports. */
  static names(reference: Reference, workload: Workload): boolean {
    if (reference.category !== "compute") return false;
    return reference.output === ComputeAddress.HOST ||
      ComputeAddress.port(reference, workload) !== undefined;
  }

  /** The declared port `reference` names, as the manifest wrote it; absent if there is none. */
  static port(reference: Reference, workload: Workload): unknown {
    const ports = workload.compute?.[reference.name]?.params.ports;
    if (typeof ports !== "object" || ports === null) return undefined;
    return (ports as Record<string, unknown>)[reference.output!];
  }
}
