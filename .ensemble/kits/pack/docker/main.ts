import { dirname, fromFileUrl, join } from "@std/path";
import { ensureDir } from "@std/fs";
import { $ } from "@david/dax";
import * as KitSdk from "@ensemble/kit-sdk";

const kitDir = dirname(fromFileUrl(import.meta.url));
const ctx = KitSdk.Pack.getContext();

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Only apps this ship's Dockerfile actually references (via `COPY
// --from=<app>`) get registered as build contexts — an app declared in
// .ensemble/config.yaml but unused by this Dockerfile is left alone. Each
// referenced app is required to have build output under artifacts/, so a
// stale/unrelated same-named image can never be silently substituted (see
// ArtifactDependencyTracker in @ensemble/core, which enforces this from the
// reported result).
const dockerfileText = await Deno.readTextFile(join(ctx.ship, "Dockerfile"));
const referencedApps = ctx.apps.filter((app) => {
  const fromPattern = new RegExp(`--from=${escapeRegExp(app)}(?=\\s)`);
  return fromPattern.test(dockerfileText);
});

const artifactContextArgs: string[] = [];
for (const app of referencedApps) {
  artifactContextArgs.push("--build-context", `${app}=${join(ctx.artifacts, app)}`);
}
await KitSdk.Pack.writeResult(ctx, { artifacts: referencedApps });

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

const result = await $`docker buildx build
  --tag ${ctx.outputName}
  --build-context packages=${ctx.packages}
  ${artifactContextArgs}
  --output ${output}
  ${allowArgs}
  ${ctx.ship}`
  .noThrow();

Deno.exit(result.code);
