import type { Realization } from "../kit/realization.ts";
import type { Reference } from "../reference.ts";
import type { Workload } from "../workload.ts";
import { ComputeAddress } from "../compute-address.ts";

/** Raised when a compute's host is referenced on a kit that gives it none. */
export class ComputeAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComputeAddressError";
  }
}

/**
 * Resolves a reference to a compute's address (`ComputeAddress`) without
 * waiting for the compute to be rendered: a port straight from the manifest,
 * the host from the kit's realization.
 */
export class ComputeAddresses {
  constructor(
    private readonly realization: Realization,
    /** The deployment's own name — what a kit scopes the host with. Absent where nothing is being deployed. */
    private readonly deployment?: string,
  ) {}

  async resolve(reference: Reference, workload: Workload): Promise<unknown> {
    const port = ComputeAddress.port(reference, workload);
    if (port !== undefined) return port;

    const type = workload.compute![reference.name].type;
    const host = this.deployment === undefined
      ? undefined
      : await this.realization.hostOf?.(
        "compute",
        type,
        reference.name,
        this.deployment,
      );
    if (host === undefined) {
      throw new ComputeAddressError(
        `compute.${reference.name}.host can't be resolved: this kit gives a compute of type "${type}" no host a deployment could reach it by.`,
      );
    }
    return host;
  }
}
