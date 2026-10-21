import { join } from "@std/path";
import { exists } from "@std/fs";
import type { Ports } from "./ports.ts";
import { EnsembleConfigStore } from "./config.ts";
import { integrationOf, isReserved } from "./deploy/integration.ts";

const APP_NAME_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9._\-/]*[a-zA-Z0-9])?$/;
const KIT_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export interface RunAppCreateOptions {
  kit: string;
  name: string;
  /** Static build variant to scaffold for (e.g. the `react` kit's "ssr"), forwarded to the kit's scaffold.ts and persisted as build.<name>.target. */
  target?: string;
  /** Scaffold the app's integration for this deploy kit (`source/integrations/<kit>/<name>`) instead of the app — for an app that already exists. */
  integration?: string;
}

/**
 * Scaffolds a new app at source/apps/<name> — or, given `integration`, that
 * app's integration for a deploy kit at source/integrations/<kit>/<name> —
 * by running its chosen kit's scaffold.ts (the same CLI contract build/pack kits use, see
 * @ensemble/kit-sdk's Scaffold.getContext), then registers
 * build.<name>.kit (and .target, if given) in .ensemble/config.yaml via
 * EnsembleConfigStore.setAppBuildKit — or, for an integration,
 * build.<name>.integrations.<deploy kit>.kit via setAppIntegration — so it's
 * immediately buildable with `ens build <name>`.
 */
export async function runAppCreate(
  options: RunAppCreateOptions,
  ports: Ports,
): Promise<void> {
  const name = options.name.trim();
  if (!APP_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid app name "${options.name}" — expected letters, digits, ".", "_", "-", or "/", ` +
        `not starting or ending with a separator.`,
    );
  }
  if (isReserved(name)) {
    throw new Error(
      `"${name}" is under integrations/, which names integrations — scaffold one with --integration <kit> instead.`,
    );
  }
  if (
    options.integration !== undefined &&
    !KIT_NAME_PATTERN.test(options.integration)
  ) {
    throw new Error(`Invalid deploy kit name "${options.integration}".`);
  }

  const repoRoot = await ports.repo.findRepoRoot();
  const kitDir = join(repoRoot, ".ensemble", "kits", "build", options.kit);
  const scaffoldEntry = join(kitDir, "scaffold.ts");
  if (!await exists(scaffoldEntry, { isFile: true })) {
    throw new Error(
      `Build kit "${options.kit}" has no scaffold.ts (expected ${scaffoldEntry})`,
    );
  }

  const appDir = join(repoRoot, "source", "apps", name);
  if (
    options.integration !== undefined &&
    !await exists(appDir, { isDirectory: true })
  ) {
    throw new Error(
      `There's no app "${name}" to wire: an integration wires an existing app (source/apps/${name}).`,
    );
  }
  const config = new EnsembleConfigStore(repoRoot);
  if (options.integration !== undefined) {
    // Checked before scaffolding anything: an app built as itself is a program, not a library to wire.
    const built = (await config.loadOrEmpty()).build?.[name];
    if (built?.kit) {
      throw new Error(
        `App "${name}" is built as itself (build.${name}.kit: ${built.kit}): an app with integrations is a library, built only through them.`,
      );
    }
  }
  const unit = options.integration === undefined
    ? name
    : integrationOf(name, options.integration);
  const sourceDir = options.integration === undefined
    ? appDir
    : join(repoRoot, "source", unit);
  if (await exists(sourceDir)) {
    throw new Error(`"${sourceDir}" already exists.`);
  }

  const denoExe = await ports.denoExe.resolveDenoExecutable();
  const targetArgs = options.target ? ["--target", options.target] : [];
  // --minimum-dependency-age 0: see the identical flag in build.ts — kits
  // depend on first-party @ensemble/*/@duesabati/* packages that a fresh
  // release can otherwise trip Deno's default 24h supply-chain guard on.
  const code = await ports.process.run(
    denoExe,
    [
      "run",
      "-A",
      "-q",
      "--minimum-dependency-age",
      "0",
      scaffoldEntry,
      "--dest",
      sourceDir,
      "--name",
      unit,
      ...targetArgs,
    ],
    { cwd: kitDir },
  );
  if (code !== 0) {
    throw new Error(`Scaffolding "${unit}" with kit "${options.kit}" failed.`);
  }

  if (options.integration === undefined) {
    await config.setAppBuildKit(name, options.kit, options.target);
  } else await config.setAppIntegration(name, options.integration, options.kit);
}
