import { join } from "@std/path";
import { assert, assertEquals, assertRejects } from "@std/assert";
import { exists } from "@std/fs";
import { $ } from "@david/dax";
import { Config, Vendor } from "@ensemble/core";
import { GitPackageSource } from "./git-package-source.ts";

const { FileRegistry, LibInstaller } = Vendor;
const { EnsembleConfigStore } = Config;

async function makeSourceLibRepo(
  files: Record<string, string>,
): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await Deno.makeTempDir({
    prefix: "ensemble-lib-installer-source-",
  });
  for (const [relativePath, content] of Object.entries(files)) {
    await Deno.writeTextFile(join(dir, relativePath), content);
  }
  await $`git init -q`.cwd(dir);
  await $`git config user.email test@example.com`.cwd(dir);
  await $`git config user.name Test`.cwd(dir);
  await $`git add -A`.cwd(dir);
  await $`git commit -q -m init`.cwd(dir);
  return { dir, cleanup: () => Deno.remove(dir, { recursive: true }) };
}

async function makeProjectRepoRoot(): Promise<
  { dir: string; cleanup: () => Promise<void> }
> {
  const dir = await Deno.makeTempDir({
    prefix: "ensemble-lib-installer-project-",
  });
  await Deno.mkdir(join(dir, ".ensemble"), { recursive: true });
  return { dir, cleanup: () => Deno.remove(dir, { recursive: true }) };
}

Deno.test("LibInstaller.install: a clean lib installs, registers, and is declared in .ensemble/config.yaml — no manifest file inside it", async () => {
  const source = await makeSourceLibRepo({
    "deno.json": JSON.stringify({ name: "@x/widgets", version: "0.0.1" }),
  });
  const project = await makeProjectRepoRoot();
  try {
    const installer = new LibInstaller(
      project.dir,
      new FileRegistry(project.dir),
      new GitPackageSource(),
    );
    const entry = await installer.install(source.dir);

    assert(entry.path.startsWith(join("source", "libs")));
    assertEquals(
      await exists(join(project.dir, entry.path, "lib.yml")),
      false,
    );
    assertEquals(
      (await new FileRegistry(project.dir).entryFor(entry.path))?.repo,
      source.dir,
    );

    const name = entry.path.split("/").pop()!;
    const config = await new EnsembleConfigStore(project.dir).load();
    assertEquals(
      config.publish?.libs?.find((lib) => lib.name === name)?.package,
      "@x/widgets",
    );
  } finally {
    await source.cleanup();
    await project.cleanup();
  }
});

Deno.test("LibInstaller.install: missing deno.json name rejected", async () => {
  const source = await makeSourceLibRepo({
    "deno.json": JSON.stringify({}),
  });
  const project = await makeProjectRepoRoot();
  try {
    const installer = new LibInstaller(
      project.dir,
      new FileRegistry(project.dir),
      new GitPackageSource(),
    );
    await assertRejects(
      () => installer.install(source.dir),
      Error,
      'missing a "name"',
    );
  } finally {
    await source.cleanup();
    await project.cleanup();
  }
});

Deno.test("LibInstaller.install: a lib importing from source/core is rejected before it's placed", async () => {
  const source = await makeSourceLibRepo({
    "deno.json": JSON.stringify({
      name: "@x/widgets",
      imports: { "@ensemble/kit-sdk": "jsr:@ensemble/kit-sdk" },
    }),
  });
  const project = await makeProjectRepoRoot();
  try {
    await Deno.mkdir(join(project.dir, "source", "core", "kit-sdk"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(project.dir, "source", "core", "kit-sdk", "deno.json"),
      JSON.stringify({ name: "@ensemble/kit-sdk" }),
    );

    const installer = new LibInstaller(
      project.dir,
      new FileRegistry(project.dir),
      new GitPackageSource(),
    );
    await assertRejects(
      () => installer.install(source.dir),
      Error,
      "isn't self-contained enough to install",
    );
    assertEquals(await exists(join(project.dir, "source", "libs")), false);
  } finally {
    await source.cleanup();
    await project.cleanup();
  }
});

Deno.test("LibInstaller.install: already-installed destination rejected", async () => {
  const source = await makeSourceLibRepo({
    "deno.json": JSON.stringify({ name: "@x/widgets" }),
  });
  const project = await makeProjectRepoRoot();
  try {
    const name = source.dir.split("/").pop()!;
    await Deno.mkdir(join(project.dir, "source", "libs", name), {
      recursive: true,
    });

    const installer = new LibInstaller(
      project.dir,
      new FileRegistry(project.dir),
      new GitPackageSource(),
    );
    await assertRejects(
      () => installer.install(source.dir),
      Error,
      "already installed",
    );
  } finally {
    await source.cleanup();
    await project.cleanup();
  }
});
