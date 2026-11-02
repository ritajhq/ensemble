import { basename } from "@std/path";
import * as KitSdk from "@ensemble/kit-sdk";
import { ShellTemplate } from "./shell-template.ts";

/** The URL of the project's `origin`, when it's a git repository that has one. */
async function originOf(repoRoot: string): Promise<string | undefined> {
  const { success, stdout } = await new Deno.Command("git", {
    args: ["-C", repoRoot, "remote", "get-url", "origin"],
    stdout: "piped",
    stderr: "null",
  }).output().catch(() => ({ success: false, stdout: new Uint8Array() }));
  return success ? new TextDecoder().decode(stdout).trim() : undefined;
}

const ctx = KitSdk.Scaffold.getContext();
const repoRoot = await KitSdk.findRepoRoot(ctx.dest);
await new ShellTemplate(
  ctx.dest,
  ctx.name,
  await originOf(repoRoot),
  basename(repoRoot),
).write();
console.log(`scaffolded ${ctx.name}`);
