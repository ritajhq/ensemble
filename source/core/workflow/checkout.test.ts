import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { checkoutRepositories } from "./checkout.ts";

/** Creates a throwaway local git repo with one commit, for checkoutRepositories to clone from. */
async function makeFixtureRepo(dir: string): Promise<void> {
  await Deno.mkdir(dir, { recursive: true });
  const run = async (args: string[]) => {
    const { success } = await new Deno.Command("git", { args, cwd: dir }).output();
    if (!success) throw new Error(`git ${args.join(" ")} failed`);
  };
  await run(["init", "-q", "-b", "main"]);
  await run(["config", "user.email", "test@example.com"]);
  await run(["config", "user.name", "Test"]);
  await Deno.writeTextFile(join(dir, "file.txt"), "hello");
  await run(["add", "file.txt"]);
  await run(["commit", "-q", "-m", "initial"]);
}

Deno.test("checkoutRepositories: undefined repositories returns undefined", async () => {
  const result = await checkoutRepositories(undefined, "/tmp/unused");
  assertEquals(result, undefined);
});

Deno.test("checkoutRepositories: clones a declared repository into runDir/repos/<name>", async () => {
  const fixtureDir = await Deno.makeTempDir({ prefix: "checkout-fixture-" });
  const runDir = await Deno.makeTempDir({ prefix: "checkout-run-" });
  try {
    await makeFixtureRepo(fixtureDir);

    const result = await checkoutRepositories({ demo: { url: fixtureDir } }, runDir);

    const expectedPath = join(runDir, "repos", "demo");
    assertEquals(result, { demo: { path: expectedPath } });
    assertEquals(await Deno.readTextFile(join(expectedPath, "file.txt")), "hello");
  } finally {
    await Deno.remove(fixtureDir, { recursive: true });
    await Deno.remove(runDir, { recursive: true });
  }
});

Deno.test("checkoutRepositories: a local override skips cloning entirely", async () => {
  const fixtureDir = await Deno.makeTempDir({ prefix: "checkout-fixture-" });
  const runDir = await Deno.makeTempDir({ prefix: "checkout-run-" });
  try {
    await makeFixtureRepo(fixtureDir);
    const overridePath = await Deno.makeTempDir({ prefix: "checkout-override-" });
    await Deno.writeTextFile(join(overridePath, "local-only.txt"), "uncommitted");

    const result = await checkoutRepositories(
      { demo: { url: fixtureDir } },
      runDir,
      { demo: overridePath },
    );

    assertEquals(result, { demo: { path: overridePath } });
    // No clone happened — the run's own repos/ dir was never populated.
    let cloned = true;
    try {
      await Deno.stat(join(runDir, "repos", "demo"));
    } catch {
      cloned = false;
    }
    assertEquals(cloned, false);

    await Deno.remove(overridePath, { recursive: true });
  } finally {
    await Deno.remove(fixtureDir, { recursive: true });
    await Deno.remove(runDir, { recursive: true });
  }
});

Deno.test("checkoutRepositories: an override for one name doesn't affect a sibling that still clones", async () => {
  const fixtureDir = await Deno.makeTempDir({ prefix: "checkout-fixture-" });
  const runDir = await Deno.makeTempDir({ prefix: "checkout-run-" });
  try {
    await makeFixtureRepo(fixtureDir);
    const overridePath = await Deno.makeTempDir({ prefix: "checkout-override-" });

    const result = await checkoutRepositories(
      { demo: { url: fixtureDir }, other: { url: fixtureDir } },
      runDir,
      { demo: overridePath },
    );

    assertEquals(result?.demo, { path: overridePath });
    assertEquals(result?.other, { path: join(runDir, "repos", "other") });

    await Deno.remove(overridePath, { recursive: true });
  } finally {
    await Deno.remove(fixtureDir, { recursive: true });
    await Deno.remove(runDir, { recursive: true });
  }
});

Deno.test("checkoutRepositories: a failed clone throws", async () => {
  const runDir = await Deno.makeTempDir({ prefix: "checkout-run-" });
  try {
    await assertRejects(
      () => checkoutRepositories({ demo: { url: "/nonexistent/path/to/nowhere" } }, runDir),
      Error,
      'Failed to check out repository "demo"',
    );
  } finally {
    await Deno.remove(runDir, { recursive: true });
  }
});
