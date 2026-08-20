import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { checkoutRepositories, resolveSelfRepository } from "./checkout.ts";

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
  const result = await checkoutRepositories(undefined, "/tmp/unused", {});
  assertEquals(result, undefined);
});

Deno.test("checkoutRepositories: clones a declared repository into runDir/repos/<name>", async () => {
  const fixtureDir = await Deno.makeTempDir({ prefix: "checkout-fixture-" });
  const runDir = await Deno.makeTempDir({ prefix: "checkout-run-" });
  try {
    await makeFixtureRepo(fixtureDir);

    const result = await checkoutRepositories({ demo: { url: fixtureDir } }, runDir, {});

    const expectedPath = join(runDir, "repos", "demo");
    assertEquals(result, { demo: { path: expectedPath } });
    assertEquals(await Deno.readTextFile(join(expectedPath, "file.txt")), "hello");
  } finally {
    await Deno.remove(fixtureDir, { recursive: true });
    await Deno.remove(runDir, { recursive: true });
  }
});

Deno.test("checkoutRepositories: a --repository override skips cloning entirely", async () => {
  const fixtureDir = await Deno.makeTempDir({ prefix: "checkout-fixture-" });
  const runDir = await Deno.makeTempDir({ prefix: "checkout-run-" });
  try {
    await makeFixtureRepo(fixtureDir);
    const overridePath = await Deno.makeTempDir({ prefix: "checkout-override-" });
    await Deno.writeTextFile(join(overridePath, "local-only.txt"), "uncommitted");

    const result = await checkoutRepositories(
      { demo: { url: fixtureDir } },
      runDir,
      { overrides: { demo: overridePath } },
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
      { overrides: { demo: overridePath } },
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
      () => checkoutRepositories({ demo: { url: "/nonexistent/path/to/nowhere" } }, runDir, {}),
      Error,
      'Failed to check out repository "demo"',
    );
  } finally {
    await Deno.remove(runDir, { recursive: true });
  }
});

Deno.test("resolveSelfRepository: --local uses repoRoot directly, no clone", async () => {
  const fixtureDir = await Deno.makeTempDir({ prefix: "checkout-fixture-" });
  const runDir = await Deno.makeTempDir({ prefix: "checkout-run-" });
  try {
    await makeFixtureRepo(fixtureDir);

    const result = await resolveSelfRepository(runDir, { repoRoot: fixtureDir, local: true });

    assertEquals(result, { path: fixtureDir });
    let cloned = true;
    try {
      await Deno.stat(join(runDir, "repos", "self"));
    } catch {
      cloned = false;
    }
    assertEquals(cloned, false);
  } finally {
    await Deno.remove(fixtureDir, { recursive: true });
    await Deno.remove(runDir, { recursive: true });
  }
});

Deno.test("resolveSelfRepository: without --local, clones repoRoot's origin remote", async () => {
  const originDir = await Deno.makeTempDir({ prefix: "checkout-origin-" });
  const repoRoot = await Deno.makeTempDir({ prefix: "checkout-fixture-" });
  const runDir = await Deno.makeTempDir({ prefix: "checkout-run-" });
  try {
    await makeFixtureRepo(originDir);
    await makeFixtureRepo(repoRoot);
    const { success } = await new Deno.Command("git", {
      args: ["-C", repoRoot, "remote", "add", "origin", originDir],
    }).output();
    if (!success) throw new Error("failed to set origin remote");

    const result = await resolveSelfRepository(runDir, { repoRoot });

    const expectedPath = join(runDir, "repos", "self");
    assertEquals(result, { path: expectedPath });
    assertEquals(await Deno.readTextFile(join(expectedPath, "file.txt")), "hello");
  } finally {
    await Deno.remove(originDir, { recursive: true });
    await Deno.remove(repoRoot, { recursive: true });
    await Deno.remove(runDir, { recursive: true });
  }
});

Deno.test("resolveSelfRepository: ENSEMBLE_SELF_REPO_URL takes precedence over repoRoot's origin remote", async () => {
  const envUrlDir = await Deno.makeTempDir({ prefix: "checkout-env-url-" });
  const originDir = await Deno.makeTempDir({ prefix: "checkout-origin-" });
  const repoRoot = await Deno.makeTempDir({ prefix: "checkout-fixture-" });
  const runDir = await Deno.makeTempDir({ prefix: "checkout-run-" });
  try {
    await makeFixtureRepo(envUrlDir);
    await Deno.writeTextFile(join(envUrlDir, "from-env.txt"), "from env");
    await new Deno.Command("git", { args: ["-C", envUrlDir, "add", "from-env.txt"] }).output();
    await new Deno.Command("git", {
      args: ["-C", envUrlDir, "commit", "-q", "-m", "from env"],
    }).output();

    await makeFixtureRepo(originDir);
    await makeFixtureRepo(repoRoot);
    const { success } = await new Deno.Command("git", {
      args: ["-C", repoRoot, "remote", "add", "origin", originDir],
    }).output();
    if (!success) throw new Error("failed to set origin remote");

    Deno.env.set("ENSEMBLE_SELF_REPO_URL", envUrlDir);
    try {
      const result = await resolveSelfRepository(runDir, { repoRoot });

      const expectedPath = join(runDir, "repos", "self");
      assertEquals(result, { path: expectedPath });
      // Cloned from envUrlDir (has from-env.txt), not originDir (doesn't).
      assertEquals(await Deno.readTextFile(join(expectedPath, "from-env.txt")), "from env");
    } finally {
      Deno.env.delete("ENSEMBLE_SELF_REPO_URL");
    }
  } finally {
    await Deno.remove(envUrlDir, { recursive: true });
    await Deno.remove(originDir, { recursive: true });
    await Deno.remove(repoRoot, { recursive: true });
    await Deno.remove(runDir, { recursive: true });
  }
});

Deno.test("resolveSelfRepository: a --repository self= override wins over --local", async () => {
  const fixtureDir = await Deno.makeTempDir({ prefix: "checkout-fixture-" });
  const runDir = await Deno.makeTempDir({ prefix: "checkout-run-" });
  try {
    await makeFixtureRepo(fixtureDir);
    const overridePath = await Deno.makeTempDir({ prefix: "checkout-override-" });

    const result = await resolveSelfRepository(runDir, {
      repoRoot: fixtureDir,
      local: true,
      overrides: { self: overridePath },
    });

    assertEquals(result, { path: overridePath });

    await Deno.remove(overridePath, { recursive: true });
  } finally {
    await Deno.remove(fixtureDir, { recursive: true });
    await Deno.remove(runDir, { recursive: true });
  }
});

Deno.test("resolveSelfRepository: no origin remote configured throws a clear error", async () => {
  const repoRoot = await Deno.makeTempDir({ prefix: "checkout-fixture-" });
  const runDir = await Deno.makeTempDir({ prefix: "checkout-run-" });
  try {
    await makeFixtureRepo(repoRoot);

    await assertRejects(
      () => resolveSelfRepository(runDir, { repoRoot }),
      Error,
      'no "origin" remote configured',
    );
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
    await Deno.remove(runDir, { recursive: true });
  }
});
