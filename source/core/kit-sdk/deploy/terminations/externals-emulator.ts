import type { Workload } from "../workload.ts";
import type { Kit } from "../kit/kit.ts";

/** Thrown when `--emulate-externals` is requested but the target's kit has no emulation hook at all — a capability gap, not a bug: the manifest and target are both valid, this target just has no notion of "bring this up locally". */
export class EmulateExternalsNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmulateExternalsNotSupportedError";
  }
}

/** Thrown when a kit's own `create` command for one `external` entry exits non-zero — the entry is real, the kit knows how to emulate it, the emulation itself just failed (e.g. the Docker daemon isn't running). */
export class ExternalsEmulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalsEmulationError";
  }
}

/**
 * `--emulate-externals`'s terminal step: before a real apply, stands up a
 * local substitute for each `deploy.external` entry the target's kit knows
 * how to emulate (`Kit.emulateExternals`), instead of assuming it already
 * exists elsewhere. Runs each entry's `check` command first, silently — exit
 * zero means it's already there, so `create` is skipped — which is what
 * makes a repeated `ens develop` idempotent rather than failing on "already
 * exists", the same way `Applier`/`WatchRunner` are the only place a kit's
 * own commands actually spawn a process.
 */
export class ExternalsEmulator {
  async emulate(workload: Workload, kit: Kit): Promise<void> {
    if (!kit.emulateExternals) {
      throw new EmulateExternalsNotSupportedError(
        "This kit has no --emulate-externals support for the current target — pick a target that does, or drop the flag and bring externals up yourself.",
      );
    }

    for (const emulation of kit.emulateExternals(workload)) {
      const alreadyExists = await this.run(emulation.check, { silent: true });
      if (alreadyExists) continue;

      const created = await this.run(emulation.create, { silent: false });
      if (!created) {
        throw new ExternalsEmulationError(
          `Failed to bring up "external.${emulation.name}" (command: ${
            emulation.create.join(" ")
          }).`,
        );
      }
    }
  }

  private async run(
    argv: readonly string[],
    options: { silent: boolean },
  ): Promise<boolean> {
    const [command, ...args] = argv;
    const { success } = await new Deno.Command(command, {
      args,
      ...(options.silent ? { stdout: "null", stderr: "null" } as const : {}),
    }).spawn().status;
    return success;
  }
}
