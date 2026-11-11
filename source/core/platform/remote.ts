/**
 * A GitHub remote as git spells it, in any of its forms:
 * `https://[credentials@]github.com/owner/name[.git]`,
 * `git@github.com:owner/name[.git]` or `ssh://git@github.com/owner/name[.git]`.
 */
const GITHUB =
  /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;

/** Where a checkout was cloned from, as its `origin` remote says. */
export class Remote {
  private constructor(
    /** `owner/name`, as GitHub spells it. */
    readonly repository: string,
  ) {}

  /** The GitHub repository `url` points at; none when it points anywhere else. */
  static ofUrl(url: string): Remote | undefined {
    const match = GITHUB.exec(url.trim());
    return match ? new Remote(match[1]) : undefined;
  }
}
