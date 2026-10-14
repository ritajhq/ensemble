/** Thrown when a project is described with an id, repository or ref it can't have. */
export class InvalidProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProjectError";
  }
}

/**
 * A short DNS label. The id names the project's checkout directory, and `ens`
 * names every deployment after its checkout (`<id>-<manifest>`, then
 * `--<instance>`), which ends up as a network alias: it has to stay a label
 * and leave room for the rest.
 */
const ID = /^[a-z0-9]([a-z0-9-]{0,18}[a-z0-9])?$/;

/** `owner/name`, as GitHub spells it. */
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** A branch or tag name; nothing that git would read as an option. */
const REF = /^[^\s-][^\s]*$/;

/**
 * A GitHub repository the platform releases and deploys from: what it is
 * called here, where it lives, and the branch its delivery manifests are read
 * from.
 */
export class Project {
  private constructor(
    readonly id: string,
    /** `owner/name`. */
    readonly repository: string,
    readonly ref: string,
  ) {}

  static create(
    fields: { id: string; repository: string; ref: string },
  ): Project {
    const { id, repository, ref } = fields;
    if (!ID.test(id)) {
      throw new InvalidProjectError(
        `Invalid project id "${id}": use lowercase letters, digits and hyphens (1-20 characters, not starting or ending with a hyphen).`,
      );
    }
    if (!REPOSITORY.test(repository)) {
      throw new InvalidProjectError(
        `Invalid repository "${repository}": write it as owner/name.`,
      );
    }
    if (!REF.test(ref)) {
      throw new InvalidProjectError(`Invalid ref "${ref}".`);
    }
    return new Project(id, repository, ref);
  }

  /** Where it is cloned from. Credentials never go in it: a token travels as a header. */
  get cloneUrl(): string {
    return `https://github.com/${this.repository}.git`;
  }
}
