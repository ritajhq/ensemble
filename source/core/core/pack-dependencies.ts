import { join } from "@std/path";
import { exists } from "@std/fs";
import type * as Pack from "./pack-context.ts";
import type { Ports } from "./ports.ts";

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
  ports: Ports,
): Promise<string[]> {
  const repoRoot = await ports.repo.findRepoRoot();
  const kitDir = join(repoRoot, ".ensemble", "kits", "pack", kit);
  const kitEntry = join(kitDir, "dependencies.ts");
  if (!await exists(kitEntry, { isFile: true })) {
    return [...candidateApps];
  }

  const shipDir = join(repoRoot, "source", "ship", shipName);
  const denoExe = await ports.denoExe.resolveDenoExecutable();

  const stdout = await ports.process.capture(
    denoExe,
    [
      "run",
      "-A",
      "-q",
      "--minimum-dependency-age",
      "0",
      kitEntry,
      "--apps",
      JSON.stringify(candidateApps),
      shipDir,
    ],
    { cwd: kitDir },
  );

  const result = JSON.parse(stdout) as Pack.Result;
  return result.artifacts;
}
