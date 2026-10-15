import { join } from "@std/path";
import { exists, expandGlob } from "@std/fs";

/** The repo's Deno workspace, as its root `deno.json` declares it — either form Deno accepts (a list, or `{ members: [...] }`). */
export class Workspace {
  constructor(private readonly repoRoot: string) {}

  /** Absolute path of every member's `deno.json`, the published core libs among them. */
  async manifests(): Promise<string[]> {
    const manifests: string[] = [];
    for (const pattern of await this.memberPatterns()) {
      const configs = expandGlob(join(pattern, "deno.json"), {
        root: this.repoRoot,
        exclude: ["**/node_modules/**"],
      });
      for await (const config of configs) manifests.push(config.path);
    }
    return manifests;
  }

  private async memberPatterns(): Promise<string[]> {
    const rootConfig = join(this.repoRoot, "deno.json");
    if (!await exists(rootConfig, { isFile: true })) return [];
    const parsed = JSON.parse(await Deno.readTextFile(rootConfig));
    const workspace = parsed?.workspace;
    const patterns = Array.isArray(workspace) ? workspace : workspace?.members;
    if (!Array.isArray(patterns)) return [];
    return patterns.filter((pattern: unknown) => typeof pattern === "string");
  }
}
