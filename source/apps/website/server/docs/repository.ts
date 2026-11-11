import { join } from "@std/path";

async function git(args: string[], cwd?: string): Promise<string> {
  const { code, stdout, stderr } = await new Deno.Command("git", {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (code !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${
        new TextDecoder().decode(stderr).trim()
      }`,
    );
  }
  return new TextDecoder().decode(stdout).trim();
}

/** One folder of a public GitHub repository at a ref, published under `destination`. */
export class Repository {
  constructor(
    private readonly slug: string,
    private readonly ref: string,
    private readonly folder: string,
    private readonly destination: string,
  ) {}

  /**
   * Where the ref points on the remote, via `git ls-remote`: no API and no
   * token, so no rate limit to spend, and it works the same on any git host.
   */
  async Head(): Promise<string> {
    const listing = await git(["ls-remote", this.#url, this.ref]);
    const commit = listing.split(/\s+/)[0];
    if (!commit) throw new Error(`${this.slug} has no ref "${this.ref}"`);
    return commit;
  }

  /**
   * Shallow, sparse-clones the folder into a scratch directory beside
   * `destination` and swaps it in with a rename, so a request never sees a
   * half-synced tree. Resolves to the commit it published.
   */
  async Publish(): Promise<string> {
    const parent = join(this.destination, "..");
    await Deno.mkdir(parent, { recursive: true });
    const scratch = await Deno.makeTempDir({ dir: parent, prefix: ".sync-" });
    try {
      await git([
        "clone",
        "--quiet",
        "--depth",
        "1",
        "--filter=blob:none",
        "--sparse",
        "--branch",
        this.ref,
        this.#url,
        scratch,
      ]);
      await git(["sparse-checkout", "set", this.folder], scratch);
      const commit = await git(["rev-parse", "HEAD"], scratch);

      const cloned = join(scratch, this.folder);
      const info = await Deno.stat(cloned).catch(() => undefined);
      if (!info?.isDirectory) {
        throw new Error(
          `"${this.folder}" is not a directory on ${this.slug}@${this.ref}`,
        );
      }
      await Deno.remove(this.destination, { recursive: true }).catch(() => {});
      await Deno.rename(cloned, this.destination);
      return commit;
    } finally {
      await Deno.remove(scratch, { recursive: true }).catch(() => {});
    }
  }

  get #url(): string {
    return `https://github.com/${this.slug}.git`;
  }
}
