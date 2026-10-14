import { join } from "@std/path";
import type * as Platform from "@ensemble/platform";
import { Process } from "./process.ts";

/** A project's working copy, at the commit it was last brought to. */
export interface Checkout {
  readonly path: string;
  readonly commit: string;
}

/**
 * The working copies projects are released and deployed from: one directory
 * per project, `<workspace>/<project id>`, kept between syncs. Its name is
 * the project's id because `ens` names every deployment after its checkout's
 * directory, so deployments of different projects never share a name.
 */
export class Checkouts {
  constructor(
    private readonly workspace: string,
    /** Lets a private repository be cloned; sent as an HTTP header, never written into the clone's remote URL. */
    private readonly token?: string,
  ) {}

  /** Brings the project's checkout to its ref's current tip, cloning it first if it isn't there yet. */
  async update(project: Platform.Project): Promise<Checkout> {
    const path = join(this.workspace, project.id);

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

    const commit = (await this.git(["rev-parse", "HEAD"], path)).trim();
    return { path, commit };
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
