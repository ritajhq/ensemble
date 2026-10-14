import { Environment } from "./environment.ts";

/** Thrown when a deployment is asked for with a kit, version or termination it can't have. */
export class InvalidDeploymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDeploymentError";
  }
}

/** What a deploy does once rendered: show what would change, or change it. */
export const TERMINATIONS = ["plan", "apply"] as const;
export type Termination = typeof TERMINATIONS[number];

/** A kit's directory name, or a released version (a tag, or `latest`): nothing a command line would read as an option. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

/**
 * One environment of a delivery manifest, deployed with a kit at a released
 * version: what someone asks the platform to bring up (or to plan).
 */
export class Deployment {
  private constructor(
    readonly project: string,
    readonly manifest: string,
    readonly environment: string,
    readonly kit: string,
    readonly version: string,
    readonly termination: Termination,
  ) {}

  static create(fields: {
    project: string;
    manifest: string;
    environment: string;
    kit: string;
    version: string;
    termination: string;
  }): Deployment {
    if (!NAME.test(fields.kit)) {
      throw new InvalidDeploymentError(`Invalid kit "${fields.kit}".`);
    }
    if (!NAME.test(fields.version)) {
      throw new InvalidDeploymentError(`Invalid version "${fields.version}".`);
    }
    const termination = TERMINATIONS.find((known) =>
      known === fields.termination
    );
    if (!termination) {
      throw new InvalidDeploymentError(
        `A deploy either plans or applies, not "${fields.termination}".`,
      );
    }
    return new Deployment(
      fields.project,
      fields.manifest,
      fields.environment,
      fields.kit,
      fields.version,
      termination,
    );
  }

  /**
   * The instance it is deployed as: none for the manifest's first
   * environment, which is its plain deployment; any other is deployed beside
   * it, named after its environment.
   */
  get instance(): string | undefined {
    return this.environment === Environment.FIRST
      ? undefined
      : this.environment;
  }
}
