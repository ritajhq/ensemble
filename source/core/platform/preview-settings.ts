import { Environment } from "./environment.ts";
import { Preview } from "./preview.ts";

/** Thrown when a manifest's previews are set up in a way they can't run. */
export class InvalidPreviewSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPreviewSettingsError";
  }
}

/** A kit's directory name: nothing a command line would read as an option. */
const KIT = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

/**
 * How one delivery manifest is previewed: which branches get a preview, the
 * environment whose values each starts from, the kit it is deployed with,
 * and the variables set differently for each preview — those a browser sees
 * (origins, hosts, cookie names), written as templates over the preview's
 * own values (`https://{host:dashboard}`).
 *
 * The base is never the manifest's production environment. A preview runs
 * whatever its branch holds, and can read every value it is given: it must
 * only ever be given values that are fine to lose.
 */
export class PreviewSettings {
  private constructor(
    readonly project: string,
    readonly manifest: string,
    /** Branch patterns; `*` matches any run of characters, slashes included. */
    readonly branches: readonly string[],
    readonly base: string,
    readonly kit: string,
    readonly overrides: Readonly<Record<string, string>>,
  ) {}

  static create(fields: {
    project: string;
    manifest: string;
    branches: readonly string[];
    base: string;
    kit: string;
    overrides: Readonly<Record<string, string>>;
  }): PreviewSettings {
    if (fields.base === Environment.FIRST) {
      throw new InvalidPreviewSettingsError(
        `Previews can't start from ${Environment.FIRST}: they run whatever a branch holds, which can read every value it is given. Add an environment with values fit for that, and preview from it.`,
      );
    }
    const branches = fields.branches.map((branch) => branch.trim()).filter(
      Boolean,
    );
    if (branches.length === 0) {
      throw new InvalidPreviewSettingsError(
        "Name at least one branch to preview, such as feat/*.",
      );
    }
    if (!KIT.test(fields.kit)) {
      throw new InvalidPreviewSettingsError(`Invalid kit "${fields.kit}".`);
    }
    for (const template of Object.values(fields.overrides)) {
      Preview.check(template);
    }
    return new PreviewSettings(
      fields.project,
      fields.manifest,
      branches,
      fields.base,
      fields.kit,
      { ...fields.overrides },
    );
  }

  /** Whether `branch` gets a preview. */
  tracks(branch: string): boolean {
    return this.branches.some((pattern) => globOf(pattern).test(branch));
  }
}

function globOf(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(
    /\*/g,
    ".*",
  );
  return new RegExp(`^${escaped}$`);
}
