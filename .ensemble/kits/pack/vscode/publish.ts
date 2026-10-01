import { join } from "@std/path";
import { copy, exists } from "@std/fs";
import * as KitSdk from "@ensemble/kit-sdk";
import { findRepoRoot } from "@ensemble/kit-sdk";
import { Vsce } from "./vsce.ts";

// Publishes the unpacked folder `ens pack` produced, stamped with the release
// version — the manifest in source/ship stays version-less, so the git tag is
// the single source of truth for what version an extension is.
const ctx = KitSdk.Pack.getPublishContext();

if (!Deno.env.get("VSCE_PAT")) {
  throw new Error("VSCE_PAT must hold a Visual Studio Marketplace personal access token to publish.");
}

const repoRoot = await findRepoRoot();
const folder = join(repoRoot, "source", "artifacts", "packages", ctx.outputName);
if (!await exists(join(folder, "package.json"), { isFile: true })) {
  throw new Error(`Packed extension not found at ${folder} — run \`ens pack ${ctx.name} vscode\` first.`);
}

const stageDir = await Deno.makeTempDir({ prefix: "ens-publish-vscode-" });
try {
  await copy(folder, stageDir, { overwrite: true });
  const manifestPath = join(stageDir, "package.json");
  const manifest = JSON.parse(await Deno.readTextFile(manifestPath));
  manifest.version = ctx.version.replace(/^v/, "");
  await Deno.writeTextFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  const vsce = await Vsce.resolve();
  Deno.exit(await vsce.publish(stageDir));
} finally {
  await Deno.remove(stageDir, { recursive: true }).catch(() => {});
}
