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
 * starts out as `production`; it can be renamed, and others added beside it.
 * Its id stays the same through a rename, so what refers to it does too.
 */
export class Environment {
  /** What a manifest's first environment is called until someone renames it. */
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
    if (NAME.test(name)) return name;
    throw new InvalidEnvironmentError(
      `Invalid environment name "${name}": use lowercase letters, digits and hyphens (1-20 characters, not starting or ending with a hyphen).`,
    );
  }
}
