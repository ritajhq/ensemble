import { assertEquals, assertStringIncludes } from "@std/assert";
import { exists } from "@std/fs";
import { join } from "@std/path";
import { Workspace } from "./workspace.ts";

const HAS_CARGO = await new Deno.Command("cargo", { args: ["--version"] })
  .output().then((output) => output.success, () => false);

/** A project with a crate of no dependencies at `source/apps/x`, and that crate's own `Cargo.lock`. */
async function projectWithOwnLock(): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: "cargo-kit-test-" });
  const crate = join(root, "source", "apps", "x");
  await Deno.mkdir(join(crate, "src"), { recursive: true });
  await Deno.writeTextFile(
    join(crate, "Cargo.toml"),
    `[package]\nname = "x"\nversion = "0.1.0"\nedition = "2021"\n`,
  );
  await Deno.writeTextFile(join(crate, "src", "main.rs"), "fn main() {}\n");
  await new Deno.Command("cargo", {
    args: ["generate-lockfile", "--offline", "--quiet"],
    cwd: crate,
  }).output();
  return root;
}

Deno.test({
  name:
    "sync: sets up a root that isn't there, and moves a member's lock into it",
  ignore: !HAS_CARGO,
  async fn() {
    const root = await projectWithOwnLock();
    const crate = join(root, "source", "apps", "x");
    assertEquals(await exists(join(crate, "Cargo.lock")), true);

    await new Workspace(root).sync();

    assertEquals(await exists(join(crate, "Cargo.lock")), false);
    const lock = await Deno.readTextFile(
      join(root, ".ensemble", "ecosystems", "cargo", "Cargo.lock"),
    );
    assertStringIncludes(lock, `name = "x"`);
  },
});

Deno.test({
  name: "sync: a project with no member locks is left as it is",
  ignore: !HAS_CARGO,
  async fn() {
    const root = await projectWithOwnLock();
    await new Workspace(root).sync();
    const lock = join(root, ".ensemble", "ecosystems", "cargo", "Cargo.lock");
    const before = await Deno.readTextFile(lock);

    await new Workspace(root).sync();

    assertEquals(await Deno.readTextFile(lock), before);
  },
});
