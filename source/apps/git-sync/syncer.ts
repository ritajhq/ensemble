import { join } from "@std/path";
import type { RepoTarget } from "./config.ts";

async function run(cmd: string, args: string[], cwd?: string): Promise<void> {
  const command = new Deno.Command(cmd, {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stderr } = await command.output();
  if (code !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed: ${
        new TextDecoder().decode(stderr).trim()
      }`,
    );
  }
}

/**
 * Shallow, sparse-clones `target.repo`@`target.ref` into a scratch dir
 * (public repos only — no credential handling), keeping only `target.path`,
 * then atomically publishes it as `<destRoot>/<target.id>`. The scratch clone
 * and the staged swap both happen under `destRoot` itself (never the OS tmp
 * dir) so the final `Deno.rename` is same-filesystem and therefore atomic —
 * `website/server` never observes a half-synced tree.
 */
export async function syncRepo(
  target: RepoTarget,
  destRoot: string,
): Promise<void> {
  await Deno.mkdir(destRoot, { recursive: true });
  const scratch = await Deno.makeTempDir({
    dir: destRoot,
    prefix: `.sync-${target.id}-`,
  });

  try {
    const cloneUrl = `https://github.com/${target.repo}.git`;
    await run("git", [
      "clone",
      "--quiet",
      "--depth",
      "1",
      "--filter=blob:none",
      "--sparse",
      "--branch",
      target.ref,
      cloneUrl,
      scratch,
    ]);
    await run("git", ["sparse-checkout", "set", target.path], scratch);

    const synced = join(scratch, target.path);
    const info = await Deno.stat(synced).catch(() => undefined);
    if (!info?.isDirectory) {
      throw new Error(
        `"${target.path}" is not a directory on ${target.repo}@${target.ref}`,
      );
    }

    const dest = join(destRoot, target.id);
    const staged = join(destRoot, `.staged-${target.id}`);
    await Deno.remove(staged, { recursive: true }).catch(() => {});
    await Deno.rename(synced, staged);
    await Deno.remove(dest, { recursive: true }).catch(() => {});
    await Deno.rename(staged, dest);
  } finally {
    await Deno.remove(scratch, { recursive: true }).catch(() => {});
  }
}
