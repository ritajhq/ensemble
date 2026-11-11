/** Thrown when a project is described with a repository or ref it can't have. */
export class InvalidProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProjectError";
  }
}

/**
 * A short DNS label, derived from the repository's name. The id names the project's checkout directory, and `ens`
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
 * A GitHub repository the platform releases and deploys from: the repository
 * is the project, one project per repository, with the branch its delivery
 * manifests are read from. Its id is the repository's name made a DNS label.
 */
export class Project {
  private constructor(
    readonly id: string,
    /** `owner/name`. */
    readonly repository: string,
    readonly ref: string,
  ) {}

  static create(fields: { repository: string; ref: string }): Project {
    const { repository, ref } = fields;
    if (!REPOSITORY.test(repository)) {
      throw new InvalidProjectError(
        `Invalid repository "${repository}": write it as owner/name.`,
      );
    }
    const id = Project.idOf(repository);
    if (!ID.test(id)) {
      throw new InvalidProjectError(
        `The repository "${repository}" can't name a project: its name needs a letter or digit.`,
      );
    }
    if (!REF.test(ref)) {
      throw new InvalidProjectError(`Invalid ref "${ref}".`);
    }
    return new Project(id, repository, ref);
  }

  /** A project as it was stored: its id is kept, since its checkout, catalog and environments are keyed by it, even one chosen before ids were derived. */
  static restore(
    fields: { id: string; repository: string; ref: string },
  ): Project {
    return new Project(fields.id, fields.repository, fields.ref);
  }

  /** `repository`'s name as a DNS label: lowercased, anything else made a hyphen, cut to twenty characters. */
  static idOf(repository: string): string {
    const name = repository.split("/")[1] ?? "";
    return name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 20)
      .replace(/^-+|-+$/g, "");
  }

  /** Where it is cloned from. Credentials never go in it: a token travels as a header. */
  get cloneUrl(): string {
    return `https://github.com/${this.repository}.git`;
  }
}
