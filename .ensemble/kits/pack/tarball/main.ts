import { basename, dirname, join } from "@std/path";
import { ensureDir } from "@std/fs";
import { parse as parseYaml } from "@std/yaml";
import * as KitSdk from "@ensemble/kit-sdk";

const ctx = KitSdk.Pack.getContext();
const ship = parseYaml(
  await Deno.readTextFile(join(ctx.ship, "ship.yml")),
) as { apps?: string[] };

// A nested ship's name has folders in it.
const archive = join(ctx.packages, `${ctx.outputName}.tar.gz`);
await ensureDir(dirname(archive));

/** `tar`'s arguments adding what's at `path`: a folder's contents, or the file itself. */
async function entriesFor(path: string): Promise<string[]> {
  const stat = await Deno.stat(path).catch(() => undefined);
  if (!stat) {
    throw new Error(
      `tarball: nothing to archive at "${path}": a need's output must be a file or folder.`,
    );
  }
  return stat.isDirectory
    ? ["-C", path, "."]
    : ["-C", dirname(path), basename(path)];
}

const entries = [
  ...(ship.apps ?? []).map((app) => join(ctx.artifacts, app)),
  ...ctx.needs.map((need) => need.output),
];
const args = (await Promise.all(entries.map(entriesFor))).flat();

const { code } = await new Deno.Command("tar", {
  args: ["czf", archive, ...args],
}).spawn().status;
Deno.exit(code);
