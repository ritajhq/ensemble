const NUMBERED = /^\d+(\.\d+)*$/;
const VERSION_IN_OUTPUT = /\d+\.\d+\.\d+/;

/** The versions a project pins for one ecosystem's tools, under `tools.<ecosystem>` in `.ensemble/config.yaml`. */
export class ToolVersions {
  constructor(
    private readonly ecosystem: string,
    private readonly versions: Readonly<Record<string, string>>,
    knownTools: readonly string[],
  ) {
    const unknown = Object.keys(versions).filter((tool) =>
      !knownTools.includes(tool)
    );
    if (unknown.length === 0) return;
    throw new Error(
      `tools.${ecosystem} in .ensemble/config.yaml names ${
        unknown.join(", ")
      }, but this ecosystem only pins: ${knownTools.join(", ")}.`,
    );
  }

  of(tool: string): string | undefined {
    return this.versions[tool];
  }

  /**
   * Refuses a tool whose `--version` output isn't what's pinned. A pin may stop
   * early, so `1.90` accepts any `1.90.x`. A channel like `stable` passes, since
   * there's no number to hold it to.
   */
  refuseUnlessSatisfied(tool: string, output: string, remedy: string): void {
    const pinned = this.of(tool);
    if (pinned === undefined || !NUMBERED.test(pinned)) return;
    const found = VERSION_IN_OUTPUT.exec(output)?.[0];
    if (found === pinned || found?.startsWith(`${pinned}.`)) return;
    throw new Error(
      `tools.${this.ecosystem}.${tool} in .ensemble/config.yaml pins ${pinned}, but this machine has ${
        found ?? "an unknown version"
      }. ${remedy}`,
    );
  }
}
