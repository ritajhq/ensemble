import { join } from "@std/path";
import { exists } from "@std/fs";
import { parse as parseYaml } from "@std/yaml";
import { $ } from "@david/dax";
import * as KitSdk from "@ensemble/kit-sdk";
import { findRepoRoot } from "@ensemble/core";

const ctx = KitSdk.Pack.getPublishContext();

// `options` is a comma-separated key=value string, the same raw convention
// this kit's `modes`/`publish` values use. Only `repo` is understood; when
// absent, gh infers the repository from the working tree's git remote.
const options = Object.fromEntries(
  ctx.options.split(",").filter(Boolean).map((pair) => {
    const [key, value] = pair.split("=");
    return [key, value];
  }),
);

// deno.compile is config-file-driven: the packed binary's filename comes from
// the ship's own compile.yml `output:` (falling back to `<outputName>.exe`,
// mirroring main.ts's non-explicit-output-name branch), which is what a
// release-driven `ens pack` produced. Resolve the local file that way; the
// name it's *published* under is packageName (from the release's
// `publish.name`), independent of the local filename.
const repoRoot = await findRepoRoot();
const shipDir = join(repoRoot, "source", "ship", ctx.name);
const compilePath = join(shipDir, "compile.yml");
if (!await exists(compilePath, { isFile: true })) {
  throw new Error(`Missing compile.yml at ${compilePath}`);
}
const compileConfig = parseYaml(await Deno.readTextFile(compilePath)) as { output?: string };
const outputFile = compileConfig.output ?? `${ctx.outputName}.exe`;

const binary = join(repoRoot, "source", "artifacts", "packages", outputFile);
if (!await exists(binary, { isFile: true })) {
  throw new Error(
    `Compiled binary not found at ${binary} — run \`ens pack ${ctx.name} deno.compile\` first.`,
  );
}

const ghCheck = await $`gh --version`.quiet().noThrow();
if (ghCheck.code !== 0) {
  throw new Error(
    "gh (the GitHub CLI) is required to publish to a GitHub release but isn't on PATH — install it from https://cli.github.com first.",
  );
}

// gh uses the uploaded file's basename as the release asset name, so stage the
// binary under packageName in a temp dir to control the published name
// independently of the local compile output filename.
const stageDir = await Deno.makeTempDir({ prefix: "ens-publish-github-" });
const asset = join(stageDir, ctx.packageName);
try {
  await Deno.copyFile(binary, asset);

  const repoArgs = options.repo ? ["--repo", options.repo] : [];

  // Create the release for this version if it doesn't exist yet (the release
  // ceremony creates and pushes the git tag, but not the GitHub release
  // object), otherwise attach/replace the asset on the existing one.
  const existing = await $`gh release view ${ctx.version} ${repoArgs}`.quiet().noThrow();
  const result = existing.code === 0
    ? await $`gh release upload ${ctx.version} ${asset} ${repoArgs} --clobber`.noThrow()
    : await $`gh release create ${ctx.version} ${asset} ${repoArgs} --title ${ctx.version} --generate-notes`.noThrow();

  Deno.exit(result.code);
} finally {
  await Deno.remove(stageDir, { recursive: true }).catch(() => {});
}
