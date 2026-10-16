import { dirname, join } from "@std/path";
import * as Platform from "@ensemble/platform";
import type * as Github from "./github/index.ts";
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
    /** What clones and fetches are authorized with: the app's token for each repository, sent as an HTTP header, never written into the clone's remote URL. */
    private readonly tokens: Github.Tokens,
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

  /**
   * Brings `branch`'s own checkout to its tip, cloning it first, then runs
   * `work` in it, in one turn: what a preview is deployed from. Kept apart
   * from the project's checkout — `<workspace>/.previews/<project>/<slug>/
   * <project id>` — and still named after the project, as `ens` names its
   * deployments after the checkout's directory.
   */
  branch<T>(
    project: Platform.Project,
    branch: string,
    work: (checkout: Checkout) => Promise<T>,
  ): Promise<T> {
    const path = this.branchPathOf(project, branch);
    return this.inTurnOf(path, async () => {
      if (await this.exists(path)) {
        await this.remote(
          project,
          ["fetch", "--quiet", "--depth", "1", "origin", branch],
          path,
        );
        await this.git(["checkout", "--quiet", "--force", "FETCH_HEAD"], path);
        await this.git(["clean", "--quiet", "-fd"], path);
      } else {
        await Deno.mkdir(dirname(path), { recursive: true });
        await this.remote(project, [
          "clone",
          "--quiet",
          "--depth",
          "1",
          "--branch",
          branch,
          project.cloneUrl,
          path,
        ]);
      }
      return await work({ path, commit: await this.head(path) });
    });
  }

  /**
   * Runs `work` in `branch`'s checkout as it is, once no other work on it is
   * running: what a preview a restart cut across is rejoined in, since what
   * still runs there is working in it.
   */
  branchAsIs(
    project: Platform.Project,
    branch: string,
    work: (checkout: Checkout) => Promise<void>,
  ): Promise<void> {
    const path = this.branchPathOf(project, branch);
    return this.inTurnOf(path, async () => {
      if (!await this.exists(path)) {
        throw new NotCheckedOutError(
          `${project.id}'s branch "${branch}" isn't checked out any more.`,
        );
      }
      await work({ path, commit: await this.head(path) });
    });
  }

  /**
   * Runs `work` in `branch`'s checkout as it was last left — the branch may
   * be gone from the repository — then forgets the checkout: what a preview
   * is taken down from. Without a checkout there is nothing to take down,
   * and `work` doesn't run.
   */
  lastOfBranch(
    project: Platform.Project,
    branch: string,
    work: (checkout: Checkout) => Promise<void>,
  ): Promise<void> {
    const path = this.branchPathOf(project, branch);
    return this.inTurnOf(path, async () => {
      if (!await this.exists(path)) return;
      await work({ path, commit: await this.head(path) });
      await Deno.remove(dirname(path), { recursive: true });
    });
  }

  private branchPathOf(project: Platform.Project, branch: string): string {
    return join(
      this.workspace,
      ".previews",
      project.id,
      Platform.BranchSlug.of(branch).value,
      project.id,
    );
  }

  private pathOf(project: Platform.Project): string {
    return join(this.workspace, project.id);
  }

  private inTurn<T>(
    project: Platform.Project,
    work: () => Promise<T>,
  ): Promise<T> {
    return this.inTurnOf(project.id, work);
  }

  /** Runs `work` once no other work under `key` (a checkout) is running. */
  private inTurnOf<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.turns.get(key) ?? Promise.resolve();
    const turn = previous.then(work, work);
    this.turns.set(key, turn);
    const forget = () => {
      if (this.turns.get(key) === turn) this.turns.delete(key);
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
      await this.remote(
        project,
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
      await this.remote(project, [
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

  /** git, on the checkout alone. */
  private git(args: string[], cwd?: string): Promise<string> {
    return new Process("git", args, { cwd }).run();
  }

  /** git, reaching the project's repository on GitHub with a token for it. */
  private async remote(
    project: Platform.Project,
    args: string[],
    cwd?: string,
  ): Promise<string> {
    const token = await this.tokens.for(project.repository);
    const credential = btoa(`x-access-token:${token}`);
    return await new Process(
      "git",
      ["-c", `http.extraheader=AUTHORIZATION: basic ${credential}`, ...args],
      { cwd, concealed: [credential, token] },
    ).run();
  }
}
