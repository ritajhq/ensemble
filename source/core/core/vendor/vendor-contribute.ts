import { join } from "@std/path";
import type { PackageSource, PullRequestRef } from "./package-source.ts";
import type { Registry } from "./registry.ts";

/**
 * Proposes a vendored checkout's local change upstream — the graceful-fork
 * mechanism available uniformly to any vendored checkout, whichever
 * direction it arrived from (an installed kit or an ejected lib): propose
 * the change upstream, run the patched copy meanwhile, rather than
 * abandoning the ecosystem.
 */
export class VendorContribute {
  constructor(
    private readonly repoRoot: string,
    private readonly registry: Registry,
    private readonly source: PackageSource,
  ) {}

  async contribute(path: string): Promise<PullRequestRef> {
    const entry = await this.registry.entryFor(path);
    if (!entry) {
      throw new Error(
        `"${path}" isn't a registered vendored checkout — nothing to contribute upstream.`,
      );
    }

    return await this.source.proposeChange(join(this.repoRoot, path));
  }
}
