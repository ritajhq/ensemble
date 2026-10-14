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

/**
 * The working copies projects are released and deployed from: one directory
 * per project, `<workspace>/<project id>`, kept between syncs, with its ref's
 * whole history and every tag — a release reads the last tag, writes the
 * next one and its changelog, and pushes them. Its name is
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

  /** Brings the project's checkout to its ref's tip, then runs `work` in it, in one turn: what a release needs, since it tags and pushes that tip. */
  refresh<T>(
    project: Platform.Project,
    work: (checkout: Checkout) => Promise<T>,
  ): Promise<T> {
    return this.inTurn(
      project,
      async () => await work(await this.bringUp(project)),
    );
  }

  /** The project's released versions, newest first: its checkout's tags, by when each was made — what `ens release` bumps from, not merely the highest number. None before its first sync. */
  async versions(project: Platform.Project): Promise<string[]> {
    const path = this.pathOf(project);
    if (!await this.exists(path)) return [];
    const output = await this.git(
      ["tag", "--list", "--sort=-creatordate"],
      path,
    );
    return output.split("\n").map((tag) => tag.trim()).filter(Boolean);
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
      // A checkout cloned shallow before releases needed its history gets
      // the rest of it once.
      const shallow = await Deno.stat(join(path, ".git", "shallow")).then(
        () => ["--unshallow"],
        () => [],
      );
      await this.git(
        ["fetch", "--quiet", "--tags", "--force", ...shallow, "origin"],
        path,
      );
      await this.git(
        [
          "checkout",
          "--quiet",
          "--force",
          "-B",
          project.ref,
          `origin/${project.ref}`,
        ],
        path,
      );
      await this.git(["clean", "--quiet", "-fd"], path);
    } else {
      await Deno.mkdir(this.workspace, { recursive: true });
      await this.git([
        "clone",
        "--quiet",
        "--single-branch",
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
    if (!this.token) return new Process("git", args, { cwd }).run();
    const credential = btoa(`x-access-token:${this.token}`);
    return new Process(
      "git",
      ["-c", `http.extraheader=AUTHORIZATION: basic ${credential}`, ...args],
      { cwd, concealed: [credential, this.token] },
    ).run();
  }
}
