import { join } from "@std/path";
import { $ } from "@david/dax";
import type * as KitSdk from "@ensemble/kit-sdk";

/** Runs the actual publish step against an already-prepared library directory — its own seam so a test can stub it out instead of hitting the real registry. */
export interface PublishRunner {
  run(libRoot: string): Promise<void>;
}

/** The real runner: `deno publish` against `libRoot`. `--allow-dirty` because `publishLibrary` just rewrote `deno.json`'s `name`/`version` in place. */
export class DenoPublishRunner implements PublishRunner {
  async run(libRoot: string): Promise<void> {
    await $`deno publish --allow-dirty`.cwd(libRoot);
  }
}

/**
 * The `jsr` lib kit's own logic: stamp `libRoot/deno.json` with the package
 * name and version `ens` resolved for this publish, then hand off to
 * `runner` — for JSR there's no separate build step, `deno publish` reads
 * TypeScript source directly (Section 8 of the vendoring build plan).
 */
export async function publishLibrary(
  context: KitSdk.Lib.Context,
  runner: PublishRunner = new DenoPublishRunner(),
): Promise<void> {
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

  await runner.run(context.libRoot);
}
