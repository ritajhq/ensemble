import { Preview } from "./preview.ts";

/** Thrown when an environment would get a name it can't have. */
export class InvalidEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEnvironmentError";
  }
}

/** A DNS label: an environment beside another of the same manifest is deployed as an instance named after it. */
const NAME = /^[a-z0-9]([a-z0-9-]{0,18}[a-z0-9])?$/;

/**
 * One place a delivery manifest is deployed to, holding the values its
 * variables and secrets take there. Every manifest has at least one, which
 * starts out as `production`; others can be added beside it. A name is kept
 * for good: deployments are named after it, so a new name would orphan
 * whatever runs under the old one.
 */
export class Environment {
  /** What every manifest's first environment is called. */
  static readonly FIRST = "production";

  private constructor(
    readonly id: string,
    readonly project: string,
    readonly manifest: string,
    readonly name: string,
  ) {}

  /** The environment every manifest starts out with. */
  static first(project: string, manifest: string): Environment {
    return new Environment(
      crypto.randomUUID(),
      project,
      manifest,
      Environment.FIRST,
    );
  }

  /** Another environment of `manifest`, beside the ones it has. */
  static create(
    project: string,
    manifest: string,
    name: string,
  ): Environment {
    return new Environment(
      crypto.randomUUID(),
      project,
      manifest,
      Environment.validName(name),
    );
  }

  /** One that was already created, as it was stored. */
  static restore(
    fields: { id: string; project: string; manifest: string; name: string },
  ): Environment {
    return new Environment(
      fields.id,
      fields.project,
      fields.manifest,
      Environment.validName(fields.name),
    );
  }

  private static validName(name: string): string {
    if (!NAME.test(name)) {
      throw new InvalidEnvironmentError(
        `Invalid environment name "${name}": use lowercase letters, digits and hyphens (1-20 characters, not starting or ending with a hyphen).`,
      );
    }
    if (name.startsWith(Preview.INSTANCE_PREFIX)) {
      throw new InvalidEnvironmentError(
        `"${name}" is taken: environments are never named "${Preview.INSTANCE_PREFIX}…", which is how previews are deployed.`,
      );
    }
    return name;
  }
}
