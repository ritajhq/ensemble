import { join } from "@std/path";
import { exists } from "@std/fs";
import { $ } from "@david/dax";
import type * as KitSdk from "@ensemble/kit-sdk";
import { findRepoRoot } from "./repo.ts";
import { resolveDenoExecutable } from "./deno-exe.ts";

/**
 * Asks a pack kit which of `candidateApps` a ship's own packaging config
 * actually references — the same read-only, spawned-once-per-call pattern
 * `SubprocessPackKitGateway`'s describe/verify use, but answering "which
 * apps does this pack depend on" instead of "what's this release's
 * reference." Meant to run before `runPack`, so only the apps a ship
 * actually depends on need building first, not every declared app.
 *
 * `dependencies.ts` is optional per kit, like `describe.ts`/`verify.ts` — a
 * kit without one (deno.compile today) has nothing to say about which of its
 * candidates it depends on, so every candidate is returned unfiltered rather
 * than throwing; that's the same result a caller would get by skipping this
 * check entirely, so the capability being absent costs nothing.
 */
export async function resolvePackDependencies(
  shipName: string,
  kit: string,
  candidateApps: readonly string[],
): Promise<string[]> {
  const repoRoot = await findRepoRoot();
  const kitDir = join(repoRoot, ".ensemble", "kits", "pack", kit);
  const kitEntry = join(kitDir, "dependencies.ts");
  if (!await exists(kitEntry, { isFile: true })) {
    return [...candidateApps];
  }

  const shipDir = join(repoRoot, "source", "ship", shipName);
  const denoExe = await resolveDenoExecutable();

  const stdout =
    await $`${denoExe} run -A -q --minimum-dependency-age 0 ${kitEntry}
    --apps ${JSON.stringify(candidateApps)}
    ${shipDir}`
      .cwd(kitDir)
      .text();

  const result = JSON.parse(stdout) as KitSdk.Pack.Result;
  return result.artifacts;
}
