import { join } from "@std/path";
import { ensureDir, exists, move } from "@std/fs";
import { nameFromUrl, parseUrl } from "./git-url.ts";
import type { PackageSource } from "./package-source.ts";
import type { Registry } from "./registry.ts";
import type { Entry } from "./entry.ts";
import { SelfContainmentChecker } from "../lib-self-containment.ts";
import { EnsembleConfigStore } from "../config.ts";

/** Reads deno.json's "name" from a freshly cloned lib — the same signal `SelfContainmentChecker` uses to recognize a workspace member, and the only thing that has to live inside the library itself: everything else about it (its declared package name for publishing, its publish targets) is tracked as this project's own tooling config, not the library's. */
async function readDenoJsonName(dir: string): Promise<string> {
  const path = join(dir, "deno.json");
  let parsed: { name?: unknown };
  try {
    parsed = JSON.parse(await Deno.readTextFile(path));
  } catch {
    throw new Error(`No deno.json found at ${path} — doesn't look like an installable lib.`);
  }
  if (typeof parsed.name !== "string" || parsed.name.length === 0) {
    throw new Error(`deno.json at ${path} is missing a "name" — doesn't look like an installable lib.`);
  }
  return parsed.name;
}

/**
 * Installs a libs library from an external git repository — the inbound
 * counterpart to `LibEjector` (outbound), converging on the same lockfile
 * representation as `KitInstaller`. Kept as its own class rather than
 * reusing `KitInstaller`: a lib has no `role`/`kitSdk`/entrypoint concept to
 * validate, and instead must pass the self-containment check before it's
 * let anywhere near `source/libs/`.
 */
export class LibInstaller {
  constructor(
    private readonly repoRoot: string,
    private readonly registry: Registry,
    private readonly source: PackageSource,
  ) {}

  async install(urlWithOptionalRef: string): Promise<Entry> {
    const { url, ref } = parseUrl(urlWithOptionalRef);
    const scratchDir = await Deno.makeTempDir({
      prefix: "ensemble-lib-install-",
    });

    try {
      await this.source.fetch(url, ref, scratchDir);
      const resolvedRef = await this.source.currentRef(scratchDir);

      const packageName = await readDenoJsonName(scratchDir);

      const violations = await new SelfContainmentChecker(this.repoRoot).check(
        scratchDir,
      );
      if (violations.length > 0) {
        const details = violations.map((violation) =>
          `  - ${violation.importSpecifier}: ${violation.reason}`
        ).join(
          "\n",
        );
        throw new Error(
          `Lib at ${url} isn't self-contained enough to install:\n${details}`,
        );
      }

      const name = nameFromUrl(url);
      const relativePath = join("source", "libs", name);
      const destination = join(this.repoRoot, relativePath);
      if (await exists(destination)) {
        throw new Error(`A lib is already installed at ${relativePath}.`);
      }

      await ensureDir(join(this.repoRoot, "source", "libs"));
      await move(scratchDir, destination);

      const entry: Entry = { repo: url, ref: resolvedRef, path: relativePath };
      await this.registry.register(entry);
      await new EnsembleConfigStore(this.repoRoot).setLibPackage(name, packageName);
      return entry;
    } finally {
      if (await exists(scratchDir)) {
        await Deno.remove(scratchDir, { recursive: true });
      }
    }
  }
}
