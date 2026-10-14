/** Thrown when a release is asked for with an action or argument it can't have. */
export class InvalidReleaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReleaseError";
  }
}

/** The semver part a `next` release bumps. */
export const BUMPS = ["patch", "minor", "major"] as const;

const VERSION = /^\d+\.\d+\.\d+$/;
const TAG = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

/** What each release action takes as its argument, and how a bad one is told. */
const ACTIONS: Readonly<
  Record<string, { accepts(argument: string): boolean; expects: string }>
> = {
  next: {
    accepts: (argument) => (BUMPS as readonly string[]).includes(argument),
    expects: "patch, minor or major",
  },
  set: {
    accepts: (argument) => VERSION.test(argument),
    expects: "a version shaped x.y.z",
  },
  resume: {
    accepts: (argument) => TAG.test(argument),
    expects: "the tag of a release to finish",
  },
};

export type ReleaseAction = "next" | "set" | "resume";

/**
 * A release of a whole project: one tag for its repository, and every ship
 * its delivery manifests declare packed and published (`ens release`).
 * `next` bumps the last version, `set` names the version, `resume` finishes
 * a release whose ceremony stopped partway.
 */
export class Release {
  readonly kind = "release";

  private constructor(
    readonly project: string,
    readonly action: ReleaseAction,
    readonly argument: string,
  ) {}

  static create(
    fields: { project: string; action: string; argument: string },
  ): Release {
    const action = ACTIONS[fields.action];
    if (!action) {
      throw new InvalidReleaseError(
        `A release is next, set or resume, not "${fields.action}".`,
      );
    }
    if (!action.accepts(fields.argument)) {
      throw new InvalidReleaseError(
        `"${fields.action}" takes ${action.expects}, not "${fields.argument}".`,
      );
    }
    return new Release(
      fields.project,
      fields.action as ReleaseAction,
      fields.argument,
    );
  }
}
