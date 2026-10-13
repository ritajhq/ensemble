import { join } from "@std/path";
import { exists } from "@std/fs";
import * as Deploy from "./deploy/index.ts";
import { deploymentNameFor } from "./deploy-context.ts";
import type { Instance } from "./instance.ts";
import type { Ports } from "./ports.ts";

export interface RunDestroyOptions {
  /** Which instance of the manifest to take down (`--instance`); absent is its one plain deployment. */
  instance?: Instance;
}

/** The kit has no native way to tear a deployment down (`Kit.destroyCommand`). */
export class DestroyUnsupportedError extends Error {}

/** The teardown command itself exited non-zero. */
export class DestroyError extends Error {}

/**
 * Takes a deployment down: the kit's own `destroyCommand`, then the state
 * `ens deploy` kept for it (rendered artifact, render cache, task snapshot),
 * which describes something that no longer exists.
 *
 * Needs neither the manifest's values nor a render — the deployment is found
 * by its scope alone — so a branch's preview can be destroyed from a
 * pipeline that never loaded that branch's environment. The manifest is
 * still required to exist, so a mistyped name can't silently match nothing.
 */
export async function runDestroy(
  name: string,
  kit: string,
  options: RunDestroyOptions,
  ports: Ports,
  kitLoader: Deploy.KitLoader,
): Promise<void> {
  const repoRoot = await ports.repo.findRepoRoot();
  const workloadDir = join(repoRoot, "ci", name);
  if (!await new Deploy.Manifest.Locator().find(workloadDir)) {
    throw new Error(`Delivery manifest not found in ${workloadDir}`);
  }

  const kitDir = join(repoRoot, ".ensemble", "kits", "deploy", kit);
  if (!await exists(join(kitDir, "main.ts"), { isFile: true })) {
    throw new Error(
      `Deploy kit "${kit}" not found (expected ${kitDir}/main.ts)`,
    );
  }

  const scope = options.instance ? options.instance.scope(name) : name;
  const deploymentName = deploymentNameFor(repoRoot, scope);
  const outputsDir = join(repoRoot, "source", "artifacts", "deploy", scope);

  const loaded = await kitLoader.load(kitDir, [
    join(repoRoot, "ci", name, `${kit}.config.yml`),
  ]);
  if (!loaded.kit.destroyCommand) {
    throw new DestroyUnsupportedError(
      `Deploy kit "${kit}" can't tear a deployment down.`,
    );
  }

  const [command, ...args] = await loaded.kit.destroyCommand(deploymentName);
  const { success, code } = await new Deno.Command(command, { args }).spawn()
    .status;
  if (!success) {
    throw new DestroyError(
      `Destroy command "${
        [command, ...args].join(" ")
      }" failed with code ${code}.`,
    );
  }

  await Deno.remove(outputsDir, { recursive: true }).catch(ignoreMissing);
  await Deno.remove(join(repoRoot, ".ensemble", "deploy", scope), {
    recursive: true,
  }).catch(ignoreMissing);
  console.log(`Destroyed "${deploymentName}".`);
}

function ignoreMissing(error: unknown): void {
  if (!(error instanceof Deno.errors.NotFound)) throw error;
}
