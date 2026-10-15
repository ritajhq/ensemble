/** What a preview change does: bring the branch's preview up to its tip, or take it down. */
export type PreviewIntent = "deploy" | "destroy";

const INTENTS: readonly PreviewIntent[] = ["deploy", "destroy"];

/** A kit's directory name: nothing a command line would read as an option. */
const KIT = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

/** Thrown when a preview change is asked for with an intent it can't have. */
export class InvalidPreviewChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPreviewChangeError";
  }
}

/**
 * One branch's preview of one delivery manifest, brought up to the branch's
 * tip (it was pushed) or taken down (it was deleted): what a run carries out
 * for a preview.
 */
export class PreviewChange {
  readonly kind = "preview";

  private constructor(
    readonly project: string,
    readonly manifest: string,
    readonly branch: string,
    readonly intent: PreviewIntent,
    /** The kit it is deployed with — taken down with the same one, whatever its manifest's settings say by then. */
    readonly kit: string,
  ) {}

  static create(fields: {
    project: string;
    manifest: string;
    branch: string;
    intent: string;
    kit: string;
  }): PreviewChange {
    const intent = INTENTS.find((known) => known === fields.intent);
    if (!intent) {
      throw new InvalidPreviewChangeError(
        `A preview is deployed or destroyed, not "${fields.intent}".`,
      );
    }
    if (!fields.branch || fields.branch.startsWith("-")) {
      throw new InvalidPreviewChangeError(`Invalid branch "${fields.branch}".`);
    }
    if (!KIT.test(fields.kit)) {
      throw new InvalidPreviewChangeError(`Invalid kit "${fields.kit}".`);
    }
    return new PreviewChange(
      fields.project,
      fields.manifest,
      fields.branch,
      intent,
      fields.kit,
    );
  }
}
