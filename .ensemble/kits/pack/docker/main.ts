import { dirname, fromFileUrl, join } from "@std/path";
import { ensureDir } from "@std/fs";
import { $ } from "@david/dax";
import * as KitSdk from "@ensemble/kit-sdk";
import { referencedApps } from "./referenced-apps.ts";

const kitDir = dirname(fromFileUrl(import.meta.url));
const ctx = KitSdk.Pack.getContext();

// Only apps this ship's Dockerfile actually references (via `COPY
// --from=<app>`) get registered as build contexts — an app declared in
// .ensemble/config.yaml but unused by this Dockerfile is left alone. `ens`
// asks this same question up front via dependencies.ts and builds exactly
// these apps before ever spawning this script, so their output is already
// there by now.
const dependencies = await referencedApps(ctx.ship, ctx.apps);

const artifactContextArgs: string[] = [];
for (const app of dependencies) {
  artifactContextArgs.push("--build-context", `${app}=${join(ctx.artifacts, app)}`);
}

const modes = await KitSdk.Pack.loadModes(kitDir);
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

// --verbose lets buildx's own progress log (layer pulls, build steps, the
// works) through unfiltered — otherwise it's hidden behind the pack spinner,
// via --progress=quiet (still writes real errors to stderr) plus discarding
// stdout outright (quiet mode's only remaining output there on success is a
// bare content-digest line, which the spinner's own resolved line replaces).
const progressArgs = ctx.verbose ? [] : ["--progress", "quiet"];

const build = $`docker buildx build
  --tag ${ctx.outputName}
  --build-context packages=${ctx.packages}
  ${artifactContextArgs}
  --output ${output}
  ${allowArgs}
  ${progressArgs}
  ${ctx.ship}`
  .noThrow();

const result = await (ctx.verbose ? build : build.stdout("null"));

Deno.exit(result.code);
