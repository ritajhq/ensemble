import { globToRegExp, join, relative, SEPARATOR } from "@std/path";
import { exists, walk } from "@std/fs";
import { type Zippable, zipSync } from "fflate";
import type { SyncRule } from "./development-sync.ts";

// A fixed timestamp (zip's own earliest), so the same files always zip to the
// same bytes — the function pack kit does the same.
const REPRODUCIBLE_MTIME = new Date("1980-01-01T00:00:00Z");

/**
 * A function's deployment package as `ens develop` builds it from sync rules:
 * each rule's app build output (`<artifacts>/<app>`), placed at the rule's
 * `path` inside the zip — `/` being the package root, where the function pack
 * kit puts it too.
 */
export class FunctionPackage {
  constructor(
    private readonly rules: readonly SyncRule[],
    private readonly artifactsDir: string,
  ) {}

  /** Whether a change to `file` (relative to a rule's source) is one that rule leaves out. */
  ignores(rule: SyncRule, file: string): boolean {
    return (rule.ignore ?? []).some((pattern) =>
      globToRegExp(pattern, { extended: true, globstar: true }).test(file)
    );
  }

  async zip(): Promise<Uint8Array> {
    const files: Zippable = {};
    for (const rule of this.rules) {
      const source = join(this.artifactsDir, rule.app);
      if (!await exists(source, { isDirectory: true })) {
        throw new Error(`No build of "${rule.app}" at ${source} to sync.`);
      }
      const prefix = rule.path.split("/")
        .filter((segment) => segment !== "" && segment !== ".")
        .map((segment) => `${segment}/`)
        .join("");
      for await (const entry of walk(source, { includeDirs: false })) {
        const file = relative(source, entry.path).split(SEPARATOR).join("/");
        if (this.ignores(rule, file)) continue;
        files[`${prefix}${file}`] = await Deno.readFile(entry.path);
      }
    }
    return zipSync(files, { level: 9, mtime: REPRODUCIBLE_MTIME });
  }
}
