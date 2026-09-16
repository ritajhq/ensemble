import { join } from "@std/path";
import { assert, assertEquals, assertRejects } from "@std/assert";
import { exists } from "@std/fs";
import { $ } from "@david/dax";
import { FileRegistry } from "./registry.ts";
import { GitPackageSource } from "./git-package-source.ts";
import { KitInstaller } from "./kit-installer.ts";

async function makeSourceKitRepo(
  files: Record<string, string>,
): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await Deno.makeTempDir({
    prefix: "ensemble-kit-installer-source-",
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

async function makeProjectRepoRoot(
  kitSdkVersion: string,
): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await Deno.makeTempDir({
    prefix: "ensemble-kit-installer-project-",
  });
  await Deno.mkdir(join(dir, ".ensemble"), { recursive: true });
  await Deno.writeTextFile(
    join(dir, "deno.lock"),
    JSON.stringify({
      version: "4",
      specifiers: { [`jsr:@ensemble/kit-sdk@${kitSdkVersion}`]: kitSdkVersion },
    }),
  );
  return { dir, cleanup: () => Deno.remove(dir, { recursive: true }) };
}

Deno.test("KitInstaller.install: compatible build kit installs and routes by role", async () => {
  const source = await makeSourceKitRepo({
    "kit.yml": `role: build\nkitSdk: "^0.5.0"\n`,
    "main.ts": `export {};\n`,
  });
  const project = await makeProjectRepoRoot("0.5.2");
  try {
    const installer = new KitInstaller(
      project.dir,
      new FileRegistry(project.dir),
      new GitPackageSource(),
    );
    const entry = await installer.install(source.dir);

    assert(entry.path.startsWith(join(".ensemble", "kits", "build")));
    assert(
      await exists(join(project.dir, entry.path, "main.ts"), { isFile: true }),
    );

    const registered = await new FileRegistry(project.dir).entryFor(entry.path);
    assertEquals(registered?.repo, source.dir);
  } finally {
    await source.cleanup();
    await project.cleanup();
  }
});

Deno.test("KitInstaller.install: unknown role rejected", async () => {
  const source = await makeSourceKitRepo({
    "kit.yml": `role: nonsense\nkitSdk: "^0.5.0"\n`,
    "main.ts": `export {};\n`,
  });
  const project = await makeProjectRepoRoot("0.5.2");
  try {
    const installer = new KitInstaller(
      project.dir,
      new FileRegistry(project.dir),
      new GitPackageSource(),
    );
    await assertRejects(() => installer.install(source.dir), Error, "invalid");
  } finally {
    await source.cleanup();
    await project.cleanup();
  }
});

Deno.test("KitInstaller.install: incompatible kitSdk rejected with both versions named", async () => {
  const source = await makeSourceKitRepo({
    "kit.yml": `role: build\nkitSdk: "^0.5.0"\n`,
    "main.ts": `export {};\n`,
  });
  const project = await makeProjectRepoRoot("1.0.0");
  try {
    const installer = new KitInstaller(
      project.dir,
      new FileRegistry(project.dir),
      new GitPackageSource(),
    );
    const error = await assertRejects(
      () => installer.install(source.dir),
      Error,
    );
    assert(error.message.includes("^0.5.0"));
    assert(error.message.includes("1.0.0"));
  } finally {
    await source.cleanup();
    await project.cleanup();
  }
});

Deno.test("KitInstaller.install: missing required entrypoint rejected", async () => {
  const source = await makeSourceKitRepo({
    "kit.yml": `role: pack\nkitSdk: "^0.5.0"\n`,
    "main.ts": `export {};\n`,
    // no publish.ts, which "pack" requires
  });
  const project = await makeProjectRepoRoot("0.5.2");
  try {
    const installer = new KitInstaller(
      project.dir,
      new FileRegistry(project.dir),
      new GitPackageSource(),
    );
    await assertRejects(
      () => installer.install(source.dir),
      Error,
      "publish.ts",
    );
  } finally {
    await source.cleanup();
    await project.cleanup();
  }
});
