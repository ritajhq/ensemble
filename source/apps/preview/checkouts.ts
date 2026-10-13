import { dirname, join } from "@std/path";
import type { Preview } from "./configuration.ts";
import { Process } from "./process.ts";

/**
 * The working copies previews are deployed from: one directory per preview,
 * `<workspace>/<slug>/<repository name>`, kept between pushes. Keeping it is
 * what lets a later `ens destroy` find the manifest and kit the deployment
 * came from, and keeps `ens`'s own record of what it last applied.
 */
export class Checkouts {
  constructor(
    private readonly workspace: string,
    /** Lets a private repository be cloned; sent as an HTTP header, never written into the clone's remote URL. */
    private readonly token?: string,
  ) {}

  /** The directory `preview` is (or will be) checked out in; its last segment names the repository, which is what scopes the deployment's name. */
  pathOf(preview: Preview): string {
    const name = preview.repository.name.split("/")[1];
    return join(this.workspace, preview.slug, name);
  }

  async exists(preview: Preview): Promise<boolean> {
    return await Deno.stat(join(this.pathOf(preview), ".git")).then(
      () => true,
      () => false,
    );
  }

  /** Brings the preview's checkout to the branch's current tip, cloning it first if it isn't there yet. Returns its directory. */
  async update(preview: Preview): Promise<string> {
    const path = this.pathOf(preview);
    const { branch } = preview;

    if (await this.exists(preview)) {
      await this.git(
        ["fetch", "--quiet", "--depth", "1", "origin", branch],
        path,
      );
      await this.git(["reset", "--quiet", "--hard", "FETCH_HEAD"], path);
      await this.git(["clean", "--quiet", "-fd"], path);
      return path;
    }

    await Deno.mkdir(dirname(path), { recursive: true });
    await this.git([
      "clone",
      "--quiet",
      "--depth",
      "1",
      "--branch",
      branch,
      `https://github.com/${preview.repository.name}.git`,
      path,
    ]);
    return path;
  }

  /** Forgets the preview's checkout, and the directory around it. */
  async remove(preview: Preview): Promise<void> {
    await Deno.remove(dirname(this.pathOf(preview)), { recursive: true })
      .catch((error) => {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      });
  }

  private async git(args: string[], cwd?: string): Promise<void> {
    const authorization = this.token
      ? [
        "-c",
        `http.extraheader=AUTHORIZATION: basic ${
          btoa(`x-access-token:${this.token}`)
        }`,
      ]
      : [];
    await new Process("git", [...authorization, ...args], { cwd }).run();
  }
}
