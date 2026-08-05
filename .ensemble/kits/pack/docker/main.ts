import { dirname, fromFileUrl, join } from "@std/path";
import { ensureDir } from "@std/fs";
import { $ } from "@david/dax";
import { getPackKitContext, loadKitModes } from "@ensemble/kit-sdk";

const kitDir = dirname(fromFileUrl(import.meta.url));
const ctx = getPackKitContext();

const modes = await loadKitModes(kitDir);
const format = modes[ctx.mode];
if (!format) {
  const available = Object.keys(modes).join(", ") || "(none declared)";
  throw new Error(`Unknown mode "${ctx.mode}" for the docker kit. Available modes: ${available}`);
}

// ctx.outputName (the ship name by default, but overridable via
// --output-name) is used directly as the image tag/name (it may already
// include a registry prefix, e.g. "ghcr.io/my-org/my-app") and, for
// file-producing modes, as the resulting archive's path under the packages
// folder.
let output: string;
const allowArgs: string[] = [];
if (format.startsWith("image")) {
  // Loads straight into the local image store; no packages-folder artifact.
  output = `type=${format},name=${ctx.outputName}`;
} else if (format.startsWith("local")) {
  const dest = join(ctx.packages, ctx.outputName);
  await ensureDir(dirname(dest));
  output = `type=${format},dest=${dest}`;
  if (format.includes("mode=delete")) {
    // Buildx requires explicit opt-in to let the local exporter clear dest.
    allowArgs.push("--allow", "buildx.local.delete");
  }
} else {
  const dest = join(ctx.packages, `${ctx.outputName}.tar`);
  await ensureDir(dirname(dest));
  output = `type=${format},dest=${dest}`;
}

const result = await $`docker buildx build
  --no-cache
  --tag ${ctx.outputName}
  --build-context packages=${ctx.packages}
  --build-context artifacts=${ctx.artifacts}
  --output ${output}
  ${allowArgs}
  ${ctx.ship}`
  .noThrow();

Deno.exit(result.code);
