import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import * as KitSdk from "@ensemble/kit-sdk";

/**
 * Stands in for crates.io: packages a crate into a local directory, so a
 * release can be exercised without publishing anything. It packages the whole
 * workspace, since cargo looks up a crate's sibling dependencies on the registry
 * unless they're being packaged alongside it.
 */
const LOCAL_REGISTRY = ["source", "artifacts", "packages", "local-registry"];

const VERSION_LINE = /^version = "[^"]*"$/m;

await KitSdk.Lib.run({
  authorize: () => Promise.resolve(),

  stamp: async ({ libRoot, version }) => {
    const path = join(libRoot, "Cargo.toml");
    const manifest = await Deno.readTextFile(path);
    await Deno.writeTextFile(
      path,
      manifest.replace(
        VERSION_LINE,
        `version = "${version.replace(/^v/, "")}"`,
      ),
    );
  },

  publish: async ({ libRoot }) => {
    const repoRoot = await KitSdk.findRepoRoot();
    const registry = join(repoRoot, ...LOCAL_REGISTRY);
    await ensureDir(registry);
    const { code } = await new Deno.Command("cargo", {
      args: [
        "package",
        "--quiet",
        "--allow-dirty",
        "--no-verify",
        "--workspace",
        "--target-dir",
        registry,
      ],
      cwd: join(repoRoot, "source"),
    }).spawn().status;
    if (code !== 0) Deno.exit(code);
  },
});
