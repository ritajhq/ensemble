import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { DeployKitChoice, NoDeployKitError } from "./deploy-kit-choice.ts";

async function withRepo(
  config: string | undefined,
  run: (choice: DeployKitChoice) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir();
  try {
    if (config !== undefined) {
      await Deno.mkdir(join(repoRoot, ".ensemble"));
      await Deno.writeTextFile(
        join(repoRoot, ".ensemble", "config.yaml"),
        config,
      );
    }
    await run(new DeployKitChoice(repoRoot));
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
}

const CONFIGURED = "deploy:\n  shop:\n    kit: aws\n";

Deno.test("DeployKitChoice.for: the kit the command names wins over the configured one", async () => {
  await withRepo(CONFIGURED, async (choice) => {
    assertEquals(await choice.for("shop", "compose", "compose"), "compose");
  });
});

Deno.test("DeployKitChoice.for: without one named, deploy.<name>.kit in config.yaml is used", async () => {
  await withRepo(CONFIGURED, async (choice) => {
    assertEquals(await choice.for("shop", undefined), "aws");
    assertEquals(await choice.for("shop", undefined, "compose"), "aws");
  });
});

Deno.test("DeployKitChoice.for: the command's fallback applies when config.yaml names none for the deployment", async () => {
  await withRepo(CONFIGURED, async (choice) => {
    assertEquals(await choice.for("blog", undefined, "compose"), "compose");
  });
  await withRepo(undefined, async (choice) => {
    assertEquals(await choice.for("blog", undefined, "compose"), "compose");
  });
});

Deno.test("DeployKitChoice.for: with nothing naming a kit, the error says how to name one", async () => {
  await withRepo(CONFIGURED, async (choice) => {
    await assertRejects(
      () => choice.for("blog", undefined),
      NoDeployKitError,
      'set "deploy.blog.kit" in .ensemble/config.yaml',
    );
  });
});
