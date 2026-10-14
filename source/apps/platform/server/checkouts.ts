import { join } from "@std/path";
import type * as Platform from "@ensemble/platform";
import { Process } from "./process.ts";

/** A project's working copy, at the commit it was last brought to. */
export interface Checkout {
  readonly path: string;
  readonly commit: string;
}

/** Thrown when work needs a project's checkout before its first sync made one. */
export class NotCheckedOutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotCheckedOutError";
  }
}

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)/;

/**
 * The working copies projects are released and deployed from: one directory
 * per project, `<workspace>/<project id>`, kept between syncs. Its name is
 * the project's id because `ens` names every deployment after its checkout's
 * directory, so deployments of different projects never share a name.
 *
 * Work on one project's checkout takes turns — a sync never resets the files
 * a deploy is reading — while different projects work side by side.
 */
export class Checkouts {
  private readonly turns = new Map<string, Promise<unknown>>();

  constructor(
    private readonly workspace: string,
    /** Lets a private repository be cloned; sent as an HTTP header, never written into the clone's remote URL. */
    private readonly token?: string,
  ) {}

  /** Brings the project's checkout to its ref's current tip, cloning it first if it isn't there yet. */
  update(project: Platform.Project): Promise<Checkout> {
    return this.inTurn(project, () => this.bringUp(project));
  }

  /** Runs `work` in the project's checkout, as it is, once no other work on it is running. */
  use<T>(
    project: Platform.Project,
    work: (checkout: Checkout) => Promise<T>,
  ): Promise<T> {
    return this.inTurn(project, async () => {
      const path = this.pathOf(project);
      if (!await this.exists(path)) {
        throw new NotCheckedOutError(
          `"${project.id}" hasn't been checked out yet: sync it first.`,
        );
      }
      return await work({ path, commit: await this.head(path) });
    });
  }

  /** The project's released versions, newest first: its repository's tags, read from the remote, since a checkout is shallow. */
  async versions(project: Platform.Project): Promise<string[]> {
    const output = await this.git([
      "ls-remote",
      "--tags",
      "--refs",
      project.cloneUrl,
    ]);
    return output.split("\n")
      .map((line) => line.split("refs/tags/")[1]?.trim())
      .filter((tag): tag is string => !!tag)
      .sort(newestFirst);
  }

  private pathOf(project: Platform.Project): string {
    return join(this.workspace, project.id);
  }

  private inTurn<T>(
    project: Platform.Project,
    work: () => Promise<T>,
  ): Promise<T> {
    const previous = this.turns.get(project.id) ?? Promise.resolve();
    const turn = previous.then(work, work);
    this.turns.set(project.id, turn);
    const forget = () => {
      if (this.turns.get(project.id) === turn) this.turns.delete(project.id);
    };
    turn.then(forget, forget);
    return turn;
  }

  private async bringUp(project: Platform.Project): Promise<Checkout> {
    const path = this.pathOf(project);

    if (await this.exists(path)) {
      await this.git(
        ["fetch", "--quiet", "--depth", "1", "origin", project.ref],
        path,
      );
      await this.git(["reset", "--quiet", "--hard", "FETCH_HEAD"], path);
      await this.git(["clean", "--quiet", "-fd"], path);
    } else {
      await Deno.mkdir(this.workspace, { recursive: true });
      await this.git([
        "clone",
        "--quiet",
        "--depth",
        "1",
        "--branch",
        project.ref,
        project.cloneUrl,
        path,
      ]);
    }

    return { path, commit: await this.head(path) };
  }

  private async head(path: string): Promise<string> {
    return (await this.git(["rev-parse", "HEAD"], path)).trim();
  }

  private async exists(path: string): Promise<boolean> {
    return await Deno.stat(join(path, ".git")).then(() => true, () => false);
  }

  private git(args: string[], cwd?: string): Promise<string> {
    const authorization = this.token
      ? [
        "-c",
        `http.extraheader=AUTHORIZATION: basic ${
          btoa(`x-access-token:${this.token}`)
        }`,
      ]
      : [];
    return new Process("git", [...authorization, ...args], { cwd }).run();
  }
}

/** Semantic versions newest first, then anything else by name. */
function newestFirst(a: string, b: string): number {
  const [x, y] = [SEMVER.exec(a), SEMVER.exec(b)];
  if (x && y) {
    for (const part of [1, 2, 3]) {
      const difference = Number(y[part]) - Number(x[part]);
      if (difference !== 0) return difference;
    }
    return b.localeCompare(a);
  }
  if (x) return -1;
  if (y) return 1;
  return a.localeCompare(b);
}
