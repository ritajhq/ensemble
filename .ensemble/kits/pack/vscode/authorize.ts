import { join } from "@std/path";
import { exists } from "@std/fs";
import * as KitSdk from "@ensemble/kit-sdk";
import { findRepoRoot } from "@ensemble/kit-sdk";
import { Vsce } from "./vsce.ts";

// Publishing goes to whichever Marketplace publisher the manifest names, so
// that's what VSCE_PAT is checked against. Read from the ship's own
// extension.json rather than the packed folder: this runs before anything
// has been packed.
await KitSdk.Pack.authorizePublish(async (ctx) => {
  if (!Deno.env.get("VSCE_PAT")) {
    throw new Error(
      "VSCE_PAT must hold a Visual Studio Marketplace personal access token to publish.",
    );
  }

  const repoRoot = await findRepoRoot();
  const manifestPath = join(
    repoRoot,
    "source",
    "ship",
    ctx.name,
    "extension.json",
  );
  if (!await exists(manifestPath, { isFile: true })) {
    throw new Error(`Missing extension.json at ${manifestPath}`);
  }
  const { publisher } = JSON.parse(await Deno.readTextFile(manifestPath)) as {
    publisher?: string;
  };
  if (!publisher) {
    throw new Error(`${manifestPath} doesn't name a "publisher".`);
  }

  await (await Vsce.resolve()).verifyPublisher(publisher);
});
