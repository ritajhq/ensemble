import { assertEquals, assertRejects } from "@std/assert";
import { exists } from "@std/fs";
import { InitCommandError, InitRunner } from "./init-runner.ts";

/** `sh` is the same host-shell assumption `Hooks` already makes for `hooks.release.after` — these tests exercise the real thing rather than a stub, since spawning it correctly *is* the behavior under test. */
function recordingScript(path: string): string {
  return `printf '%s\\n%s\\n' "$ENS_ARTIFACT_PATH" "$ENS_DEPLOYMENT_NAME" > "${path}"`;
}

Deno.test("InitRunner.run: hands each command the artifact path and deployment name the core is applying, in its environment", async () => {
  const dir = await Deno.makeTempDir();
  const seen = `${dir}/seen.txt`;
  try {
    await new InitRunner().run(
      [{ name: "record", run: recordingScript(seen) }],
      {
        artifactPath: "/repo/source/artifacts/deploy/portal/compose.yaml",
        deploymentName: "portal-portal",
      },
    );

    assertEquals(
      await Deno.readTextFile(seen),
      "/repo/source/artifacts/deploy/portal/compose.yaml\nportal-portal\n",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("InitRunner.run: runs commands in the order they were declared, inheriting the parent's own environment", async () => {
  const dir = await Deno.makeTempDir();
  const log = `${dir}/order.txt`;
  try {
    await new InitRunner().run([
      { name: "first", run: `echo first >> "${log}"` },
      // Inherits PATH only if `env` is layered onto the parent's environment
      // rather than replacing it.
      { name: "second", run: `test -n "$PATH" && echo second >> "${log}"` },
    ], {
      artifactPath: "/tmp/compose.yaml",
      deploymentName: "t",
    });

    assertEquals(await Deno.readTextFile(log), "first\nsecond\n");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("InitRunner.run: a command that exits non-zero throws InitCommandError naming it, and no later command runs", async () => {
  const dir = await Deno.makeTempDir();
  const never = `${dir}/never.txt`;
  try {
    await assertRejects(
      () =>
        new InitRunner().run([
          { name: "seed", run: "exit 3" },
          { name: "after", run: `touch "${never}"` },
        ], {
          artifactPath: "/tmp/compose.yaml",
          deploymentName: "t",
        }),
      InitCommandError,
      '"seed" failed (exit 3)',
    );

    assertEquals(await exists(never), false);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("InitRunner.run: a render pass with no init commands runs nothing at all", async () => {
  await new InitRunner().run([], {
    artifactPath: "/tmp/compose.yaml",
    deploymentName: "t",
  });
});
