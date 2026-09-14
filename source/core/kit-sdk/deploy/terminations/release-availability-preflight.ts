import type { Mode } from "../mode.ts";
import type { Workload } from "../workload.ts";
import type { PackKitGateway } from "../kit/pack-kit-gateway.ts";

export class ReleaseAvailabilityError extends Error {
  constructor(
    readonly failures: readonly {
      readonly release: string;
      readonly detail?: string;
    }[],
  ) {
    super(
      `Release(s) not available for apply:\n${
        failures.map((f) => `  ${f.release}${f.detail ? `: ${f.detail}` : ""}`)
          .join("\n")
      }`,
    );
    this.name = "ReleaseAvailabilityError";
  }
}

/**
 * Section 5b's apply-time preflight: before a production apply proceeds,
 * confirms every declared release's artifact is actually reachable at its
 * target destination — impure (a real registry/repo read), and deliberately
 * only ever run for a production apply. `eject`/`plan` (and a development
 * apply, which only ever targets a local artifact `ens pack`/`ens develop`
 * already produced) need the reference to exist as a *string* (Section 5a's
 * structural check) but never need the thing it points to to actually be
 * present yet — the whole point of a plan is to be checkable before that's
 * true.
 */
export class ReleaseAvailabilityPreflight {
  constructor(private readonly gateway: PackKitGateway) {}

  async check(workload: Workload, mode: Mode, version: string): Promise<void> {
    const failures: { release: string; detail?: string }[] = [];
    for (const [name, release] of Object.entries(workload.release ?? {})) {
      const availability = await this.gateway.verify(
        name,
        release,
        mode,
        version,
      );
      if (!availability.available) {
        failures.push({ release: name, detail: availability.detail });
      }
    }
    if (failures.length > 0) {
      throw new ReleaseAvailabilityError(failures);
    }
  }
}
