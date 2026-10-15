import { join } from "@std/path";
import { assertEquals } from "@std/assert";
import { Workspace } from "./workspace.ts";

async function withRepoRoot(
  run: (repoRoot: string) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-workspace-test-",
  });
  try {
    await run(repoRoot);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
}

async function writeMember(repoRoot: string, member: string): Promise<string> {
  const root = join(repoRoot, member);
  await Deno.mkdir(root, { recursive: true });
  const manifest = join(root, "deno.json");
  await Deno.writeTextFile(manifest, "{}\n");
  return manifest;
}

Deno.test("Workspace.manifests: lists every member matched by the root's workspace globs, skipping node_modules", async () => {
  await withRepoRoot(async (repoRoot) => {
    await Deno.writeTextFile(
      join(repoRoot, "deno.json"),
      JSON.stringify({ workspace: ["source/apps/**", ".ensemble/kits/**"] }),
    );
    const app = await writeMember(repoRoot, "source/apps/platform/server");
    const kit = await writeMember(repoRoot, ".ensemble/kits/pack/docker");
    await writeMember(repoRoot, "source/apps/web/node_modules/dep");
    await writeMember(repoRoot, "source/libs/outside");

    const manifests = await new Workspace(repoRoot).manifests();

    assertEquals(manifests.sort(), [kit, app].sort());
  });
});

Deno.test("Workspace.manifests: reads the { members } form of the workspace", async () => {
  await withRepoRoot(async (repoRoot) => {
    await Deno.writeTextFile(
      join(repoRoot, "deno.json"),
      JSON.stringify({ workspace: { members: ["source/core/*"] } }),
    );
    const core = await writeMember(repoRoot, "source/core/core");

    assertEquals(await new Workspace(repoRoot).manifests(), [core]);
  });
});

Deno.test("Workspace.manifests: a repo without a root deno.json has no members", async () => {
  await withRepoRoot(async (repoRoot) => {
    assertEquals(await new Workspace(repoRoot).manifests(), []);
  });
});
