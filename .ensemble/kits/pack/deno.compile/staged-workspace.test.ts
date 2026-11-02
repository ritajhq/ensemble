import { assertEquals, assertRejects } from "@std/assert";
import { dirname, join } from "@std/path";
import {
  shipLockfile,
  StagedWorkspace,
  WorkspaceMembers,
  WorkspaceRoot,
} from "./staged-workspace.ts";

async function repo(): Promise<string> {
  const root = await Deno.makeTempDir();
  await Deno.writeTextFile(
    join(root, "deno.json"),
    JSON.stringify({
      imports: { "@std/path": "jsr:@std/path@1" },
      workspace: ["source/**"],
      tasks: { compile: "deno compile" },
    }),
  );
  for (const member of ["source/apps/cli", "source/core/core"]) {
    await Deno.mkdir(join(root, member), { recursive: true });
    await Deno.writeTextFile(join(root, member, "deno.json"), "{}");
  }
  await Deno.mkdir(join(root, "source/apps/cli/commands"), {
    recursive: true,
  });
  return root;
}

Deno.test("members: the nearest directory holding a Deno config owns a file", async () => {
  const root = await repo();
  const members = await new WorkspaceMembers(root).reachedBy([
    join(root, "source/apps/cli/main.ts"),
    join(root, "source/apps/cli/commands/delivery.ts"),
    join(root, "source/core/core/index.ts"),
  ]);
  assertEquals(members, ["source/apps/cli", "source/core/core"]);
});

Deno.test("members: files outside the repo and in node_modules belong to none", async () => {
  const root = await repo();
  const members = await new WorkspaceMembers(root).reachedBy([
    join(root, "source/apps/cli/main.ts"),
    join(root, "node_modules/zod/index.js"),
    "/home/someone/.cache/deno/npm/zod/index.js",
  ]);
  assertEquals(members, ["source/apps/cli"]);
});

Deno.test("members: a file in no member is an error", async () => {
  const root = await repo();
  await assertRejects(
    () => new WorkspaceMembers(root).reachedBy([join(root, "script.ts")]),
    Error,
    "no workspace member",
  );
});

Deno.test("staged: links the members at their relative paths and lists only them", async () => {
  const root = await repo();
  const staged = new StagedWorkspace(
    root,
    join(root, ".ensemble/cache/cli"),
    join(root, "source/ship/cli/deno.lock"),
  );
  await staged.stage(["source/apps/cli", "source/core/core"]);

  const link = join(staged.stagedDirectory, "source/apps/cli");
  assertEquals(
    await Deno.realPath(link),
    await Deno.realPath(
      join(root, "source/apps/cli"),
    ),
  );
  const config = JSON.parse(
    await Deno.readTextFile(join(staged.stagedDirectory, "deno.json")),
  );
  assertEquals(config.workspace, ["./source/apps/cli", "./source/core/core"]);
  assertEquals(config.imports, { "@std/path": "jsr:@std/path@1" });
  assertEquals(config.tasks, undefined);
});

Deno.test("staged: the lockfile goes in before and comes back out when it changed", async () => {
  const root = await repo();
  const lockfile = join(root, ".ensemble/ecosystems/deno/ships/cli/deno.lock");
  await Deno.mkdir(dirname(lockfile), { recursive: true });
  await Deno.writeTextFile(lockfile, '{"version":"old"}');
  const staged = new StagedWorkspace(
    root,
    join(root, ".ensemble/cache/cli"),
    lockfile,
  );
  await staged.stage(["source/apps/cli"]);
  const resolved = join(staged.stagedDirectory, "deno.lock");
  assertEquals(await Deno.readTextFile(resolved), '{"version":"old"}');

  await Deno.writeTextFile(resolved, '{"version":"new"}');
  await staged.keepLockfile();
  assertEquals(JSON.parse(await Deno.readTextFile(lockfile)), {
    version: "new",
  });
});

Deno.test("staged: a first lockfile is created, along with its directory", async () => {
  const root = await repo();
  const lockfile = join(root, ".ensemble/ecosystems/deno/ships/a/b/deno.lock");
  const staged = new StagedWorkspace(
    root,
    join(root, ".ensemble/cache/cli"),
    lockfile,
  );
  await staged.stage(["source/apps/cli"]);
  await Deno.writeTextFile(
    join(staged.stagedDirectory, "deno.lock"),
    '{"version":"first"}',
  );
  await staged.keepLockfile();
  assertEquals(JSON.parse(await Deno.readTextFile(lockfile)), {
    version: "first",
  });
});

Deno.test("staged: only a member's pin moving leaves the kept lockfile alone", async () => {
  const root = await repo();
  const lockfile = join(root, ".ensemble/ecosystems/deno/ships/cli/deno.lock");
  const staged = new StagedWorkspace(
    root,
    join(root, ".ensemble/cache/cli"),
    lockfile,
  );
  await staged.stage(["source/apps/cli"]);
  const resolved = join(staged.stagedDirectory, "deno.lock");
  const resolvedWith = (pin: string) =>
    JSON.stringify({
      version: "5",
      jsr: { "@std/path@1.1.6": {} },
      workspace: { dependencies: [pin] },
    });

  await Deno.writeTextFile(resolved, resolvedWith("jsr:@ensemble/core@0.62"));
  await staged.keepLockfile();
  const kept = await Deno.readTextFile(lockfile);
  assertEquals(JSON.parse(kept).workspace, undefined);

  await Deno.writeTextFile(resolved, resolvedWith("jsr:@ensemble/core@0.63"));
  const { mtime } = await Deno.stat(lockfile);
  await staged.keepLockfile();
  assertEquals((await Deno.stat(lockfile)).mtime, mtime);
  assertEquals(await Deno.readTextFile(lockfile), kept);
});

Deno.test("shipLockfile: with the project's Deno files", async () => {
  const root = await Deno.makeTempDir();
  assertEquals(
    await shipLockfile(root, join(root, "source/ship/a/b"), "a/b"),
    join(root, ".ensemble/ecosystems/deno/ships/a/b/deno.lock"),
  );
});

Deno.test("shipLockfile: beside the ship when the root has a deno.json of its own", async () => {
  const root = await repo();
  const ship = join(root, "source/ship/cli");
  assertEquals(
    await shipLockfile(root, ship, "cli"),
    join(ship, "deno.lock"),
  );
});

Deno.test("root: the nearest ancestor whose config declares a workspace", async () => {
  const root = await repo();
  const found = await new WorkspaceRoot().above(join(root, "source/apps/cli"));
  assertEquals(found, root);
});

Deno.test("root: outside any workspace is an error", async () => {
  const outside = await Deno.makeTempDir();
  await assertRejects(
    () => new WorkspaceRoot().above(outside),
    Error,
    "not inside a Deno workspace",
  );
});
