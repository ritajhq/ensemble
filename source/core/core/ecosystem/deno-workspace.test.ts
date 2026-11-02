import { join } from "@std/path";
import { assertEquals } from "@std/assert";
import { DenoWorkspace } from "./deno-workspace.ts";
import type { Ports } from "../ports.ts";

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

Deno.test("DenoWorkspace.manifests: lists every member matched by the root's workspace globs, skipping node_modules", async () => {
  await withRepoRoot(async (repoRoot) => {
    await Deno.writeTextFile(
      join(repoRoot, "deno.json"),
      JSON.stringify({ workspace: ["source/apps/**", ".ensemble/kits/**"] }),
    );
    const app = await writeMember(repoRoot, "source/apps/platform/server");
    const kit = await writeMember(repoRoot, ".ensemble/kits/pack/docker");
    await writeMember(repoRoot, "source/apps/web/node_modules/dep");
    await writeMember(repoRoot, "source/libs/outside");

    const manifests = await new DenoWorkspace(repoRoot).manifests();

    assertEquals(manifests.sort(), [kit, app].sort());
  });
});

Deno.test("DenoWorkspace.manifests: reads the { members } form of the workspace", async () => {
  await withRepoRoot(async (repoRoot) => {
    await Deno.writeTextFile(
      join(repoRoot, "deno.json"),
      JSON.stringify({ workspace: { members: ["source/core/*"] } }),
    );
    const core = await writeMember(repoRoot, "source/core/core");

    assertEquals(await new DenoWorkspace(repoRoot).manifests(), [core]);
  });
});

Deno.test("DenoWorkspace.manifests: a repo without a root deno.json has no members", async () => {
  await withRepoRoot(async (repoRoot) => {
    assertEquals(await new DenoWorkspace(repoRoot).manifests(), []);
  });
});

Deno.test("DenoWorkspace.stamp: repins every member's versioned imports of a target to the new version", async () => {
  await withRepoRoot(async (repoRoot) => {
    await Deno.writeTextFile(
      join(repoRoot, "deno.json"),
      JSON.stringify({
        workspace: ["source/core/*", "source/apps/*", "kits/*"],
      }),
    );
    const write = async (relative: string, denoJson: object) => {
      const directory = join(repoRoot, relative);
      await Deno.mkdir(directory, { recursive: true });
      const path = join(directory, "deno.json");
      await Deno.writeTextFile(path, JSON.stringify(denoJson) + "\n");
      return path;
    };
    const core = await write("source/core/core", {
      name: "@ensemble/core",
      version: "0.13.0",
    });
    const sdk = await write("source/core/kit-sdk", {
      name: "@ensemble/kit-sdk",
      version: "0.13.0",
      imports: {
        "@ensemble/core": "jsr:@ensemble/core@^0.13.0",
        "@std/path": "jsr:@std/path@1.1.6",
      },
    });
    const kit = await write("kits/docker", {
      imports: { "@ensemble/kit-sdk": "jsr:@ensemble/kit-sdk@^0.12.0" },
    });
    const app = await write("source/apps/cli", {
      imports: { "@ensemble/core": "jsr:@ensemble/core" },
    });
    const appBefore = await Deno.readTextFile(app);

    const repinned = await new DenoWorkspace(repoRoot).stamp("0.14.0", [
      { name: "@ensemble/core", directory: join(repoRoot, "source/core/core") },
      {
        name: "@ensemble/kit-sdk",
        directory: join(repoRoot, "source/core/kit-sdk"),
      },
    ]);

    assertEquals(repinned.toSorted(), [kit, sdk].toSorted());
    const read = async (path: string) =>
      JSON.parse(await Deno.readTextFile(path));
    assertEquals((await read(core)).version, "0.14.0");
    assertEquals((await read(sdk)).imports, {
      "@ensemble/core": "jsr:@ensemble/core@^0.14.0",
      "@std/path": "jsr:@std/path@1.1.6",
    });
    assertEquals((await read(kit)).imports, {
      "@ensemble/kit-sdk": "jsr:@ensemble/kit-sdk@^0.14.0",
    });
    assertEquals(await Deno.readTextFile(app), appBefore);
  });
});

Deno.test("DenoWorkspace.packageAt: only a bare jsr import is a link", async () => {
  await withRepoRoot(async (repoRoot) => {
    await Deno.writeTextFile(
      join(repoRoot, "deno.json"),
      JSON.stringify({
        name: "@x/widgets",
        imports: {
          "@x/sibling": "jsr:@x/sibling",
          "@std/path": "jsr:@std/path@1.1.6",
          "react": "npm:react@19",
        },
      }),
    );

    const found = await new DenoWorkspace(repoRoot).packageAt(repoRoot);

    assertEquals(found?.name, "@x/widgets");
    assertEquals(found?.links, [
      { specifier: "@x/sibling", target: "@x/sibling" },
    ]);
  });
});

Deno.test("DenoWorkspace.packageAt: a directory with no deno.json holds no package", async () => {
  await withRepoRoot(async (repoRoot) => {
    assertEquals(
      await new DenoWorkspace(repoRoot).packageAt(repoRoot),
      undefined,
    );
  });
});

Deno.test("DenoWorkspace.lockfiles: only a lockfile that exists", async () => {
  await withRepoRoot(async (repoRoot) => {
    await Deno.mkdir(join(repoRoot, "source"));
    const workspace = new DenoWorkspace(repoRoot);
    assertEquals(await workspace.lockfiles(), []);
    const lockfile = join(repoRoot, "source", "deno.lock");
    await Deno.writeTextFile(lockfile, "{}");
    assertEquals(await workspace.lockfiles(), [lockfile]);
  });
});

Deno.test("DenoWorkspace: a root deno.json keeps the workspace at the repository's root", async () => {
  await withRepoRoot(async (repoRoot) => {
    await Deno.writeTextFile(join(repoRoot, "deno.json"), "{}");
    await Deno.writeTextFile(join(repoRoot, "deno.lock"), "{}");
    assertEquals(await new DenoWorkspace(repoRoot).lockfiles(), [
      join(repoRoot, "deno.lock"),
    ]);
  });
});

Deno.test("DenoWorkspace.initialize: a new workspace lives in source/, its globs relative to it", async () => {
  await withRepoRoot(async (repoRoot) => {
    await Deno.mkdir(join(repoRoot, "source"));
    const workspace = new DenoWorkspace(repoRoot);
    await workspace.initialize();
    const member = await writeMember(repoRoot, "source/apps/api");

    assertEquals(await workspace.manifests(), [member]);
  });
});

function recordingPorts(calls: { args: readonly string[]; cwd?: string }[]) {
  return {
    denoExe: { resolveDenoExecutable: () => Promise.resolve("/bin/deno") },
    process: {
      exec: (
        _command: string,
        args: readonly string[],
        options?: { cwd?: string },
      ) => {
        calls.push({ args, cwd: options?.cwd });
        return Promise.resolve();
      },
    },
  } as unknown as Pick<Ports, "denoExe" | "process">;
}

Deno.test("DenoWorkspace.stamp: a workspace in source/ refreshes its lockfile", async () => {
  await withRepoRoot(async (repoRoot) => {
    const root = join(repoRoot, "source");
    await Deno.mkdir(root);
    await Deno.writeTextFile(join(root, "deno.lock"), "{}");
    const calls: { args: readonly string[]; cwd?: string }[] = [];

    await new DenoWorkspace(repoRoot, recordingPorts(calls)).stamp("1.0.0", []);

    assertEquals(calls.length, 1);
    assertEquals(calls[0].args[0], "install");
    assertEquals(calls[0].cwd, root);
  });
});

Deno.test("DenoWorkspace.stamp: a workspace at the repository's root leaves its lockfile to its kits", async () => {
  await withRepoRoot(async (repoRoot) => {
    await Deno.writeTextFile(join(repoRoot, "deno.json"), "{}");
    await Deno.writeTextFile(join(repoRoot, "deno.lock"), "{}");
    const calls: { args: readonly string[]; cwd?: string }[] = [];

    await new DenoWorkspace(repoRoot, recordingPorts(calls)).stamp("1.0.0", []);

    assertEquals(calls, []);
  });
});

Deno.test("DenoWorkspace.manifests: a negated pattern takes members back out", async () => {
  await withRepoRoot(async (repoRoot) => {
    await Deno.writeTextFile(
      join(repoRoot, "deno.json"),
      JSON.stringify({ workspace: ["source/apps/**", "!source/apps/mock/**"] }),
    );
    const kept = await writeMember(repoRoot, "source/apps/api");
    await writeMember(repoRoot, "source/apps/mock/source/apps/api");

    assertEquals(await new DenoWorkspace(repoRoot).manifests(), [kept]);
  });
});
