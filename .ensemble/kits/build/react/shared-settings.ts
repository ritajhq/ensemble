import { dirname, join } from "@std/path";
import { exists } from "@std/fs";
import { denoConfigArgs } from "@ensemble/kit-sdk";

/**
 * The `settings.json` a project's generated Deno config is rendered from. A
 * project with a root `deno.json` has no generated config: Deno honours each
 * member's own `compilerOptions` there, so it has nothing to share.
 */
export class SharedSettings {
  constructor(private readonly repoRoot: string) {}

  /**
   * Adds whichever of `options` the project hasn't set, returning their names.
   * Compared key by key: what the project already set stays exactly as it is,
   * even where it differs, since these apply to every package in the project.
   */
  async seedCompilerOptions(
    options: Record<string, unknown>,
  ): Promise<string[]> {
    const [, generatedConfig] = await denoConfigArgs(this.repoRoot);
    if (generatedConfig === undefined) return [];

    const path = join(dirname(generatedConfig), "settings.json");
    const settings = await exists(path, { isFile: true })
      ? JSON.parse(await Deno.readTextFile(path))
      : {};
    const current = settings.compilerOptions ?? {};
    const missing = Object.keys(options).filter((name) => !(name in current));
    if (missing.length === 0) return [];

    settings.compilerOptions = { ...options, ...current };
    await Deno.writeTextFile(path, `${JSON.stringify(settings, null, 2)}\n`);
    return missing;
  }
}
