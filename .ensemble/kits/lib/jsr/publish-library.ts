import { join } from "@std/path";
import { $ } from "@david/dax";
import type * as KitSdk from "@ensemble/kit-sdk";

/** Runs the actual publish step against an already-prepared library directory — its own seam so a test can stub it out instead of hitting the real registry. */
export interface PublishRunner {
  run(libRoot: string): Promise<void>;
}

/** The real runner: `deno publish` against `libRoot`. `--allow-dirty` is a safety net for incidental repo dirt (e.g. pack artifacts) rather than load-bearing — the release ceremony commits `deno.json`'s stamped `name`/`version` before this ever runs. */
export class DenoPublishRunner implements PublishRunner {
  async run(libRoot: string): Promise<void> {
    await $`deno publish --allow-dirty`.cwd(libRoot);
  }
}

/**
 * The `jsr` lib kit's stamp step: writes `libRoot/deno.json`'s package name
 * and version to what `ens` resolved for this release. Pure local file
 * write, no network — the release ceremony commits the result before
 * tagging, so by the time `publishLibrary` runs the manifest is already
 * correct and already part of history.
 */
export async function stampLibrary(context: KitSdk.Lib.Context): Promise<void> {
  const denoJsonPath = join(context.libRoot, "deno.json");
  const denoJson = JSON.parse(await Deno.readTextFile(denoJsonPath)) as Record<
    string,
    unknown
  >;
  denoJson.name = context.package;
  denoJson.version = context.version;
  await Deno.writeTextFile(
    denoJsonPath,
    `${JSON.stringify(denoJson, null, 2)}\n`,
  );
}

/**
 * The `jsr` lib kit's publish step — for JSR there's no separate build step,
 * `deno publish` reads TypeScript source (and the already-stamped
 * `deno.json`) directly (Section 8 of the vendoring build plan).
 */
export async function publishLibrary(
  context: KitSdk.Lib.Context,
  runner: PublishRunner = new DenoPublishRunner(),
): Promise<void> {
  await runner.run(context.libRoot);
}
