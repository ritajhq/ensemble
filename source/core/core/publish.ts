import { join } from "@std/path";
import { exists } from "@std/fs";
import { load as loadEnv } from "@std/dotenv";
import type { Ports } from "./ports.ts";
import * as Pack from "./pack-context.ts";
import {
  type Authorization,
  authorizationFrom,
  PublishUnauthorizedError,
} from "./publish-authorization.ts";

/** Untracked env file holding publish-target credentials (registry passwords, GH_TOKEN, …). Loaded into the publish kit's process environment, never onto its argv. */
export const PUBLISH_SECRETS_PATH = ".ensemble/release/secrets.env";

export interface RunPublishOptions {
  /** Which named publish target to run, declared in the pack kit's own `kit.yml` "publish" map. */
  target: string;
  /** The name to publish the artifact under (kit-owned meaning — image name, release asset name, …). Defaults to `outputName`, then the ship name. */
  packageName?: string;
  /** Publish options handed to the kit's `publish.ts` (the delivery `publish:` block's properties other than target/name, e.g. `{ registry }`). */
  options?: Record<string, string>;
  /** Name of the local packed artifact the kit resolves its input from. Defaults to the ship name. */
  outputName?: string;
  /** Version to publish this artifact under. Defaults to "latest". */
  version?: string;
  varOverrides?: Record<string, string>;
}

/** A pack kit's publish entry point, resolved and ready to spawn with the standard publish kit CLI contract — shared by `runPublish` and `runPublishAuthorization` so the check sees exactly what the publish would. */
interface PublishInvocation {
  readonly kitDir: string;
  readonly kitEntry: string;
  readonly denoExe: string;
  readonly args: string[];
  readonly env: Record<string, string>;
}

async function preparePublish(
  shipName: string,
  kit: string,
  entrypoint: "publish.ts" | "authorize.ts",
  options: RunPublishOptions,
  ports: Ports,
): Promise<PublishInvocation> {
  const repoRoot = await ports.repo.findRepoRoot();

  const kitDir = join(repoRoot, ".ensemble", "kits", "pack", kit);
  if (!await exists(join(kitDir, "publish.ts"), { isFile: true })) {
    throw new Error(
      `Pack kit "${kit}" doesn't support publishing (expected ${
        join(kitDir, "publish.ts")
      }).`,
    );
  }

  const publishTargets = await Pack.loadPublishModes(kitDir);
  if (!Object.hasOwn(publishTargets, options.target)) {
    const available = Object.keys(publishTargets).join(", ") ||
      "(none declared)";
    throw new Error(
      `Unknown publish target "${options.target}" for pack kit "${kit}". Available: ${available}`,
    );
  }

  const kitEntry = join(kitDir, entrypoint);
  const denoExe = await ports.denoExe.resolveDenoExecutable();
  const outputName = options.outputName ?? shipName;
  const packageName = options.packageName ?? outputName;
  const version = options.version ?? "latest";
  const publishOptions = options.options ?? {};
  const varOverrides = options.varOverrides ?? {};

  // Credentials for publish targets (registry passwords, GH_TOKEN, …) live in
  // an untracked .ensemble/release/secrets.env and are handed to the kit through its
  // process environment — never via --vars/argv, which would leak them into
  // `ps` and any logging of the spawned command line.
  const credentials = await loadEnv({
    envPath: join(repoRoot, PUBLISH_SECRETS_PATH),
    export: false,
  });
  const env = { ...credentials, ...varOverrides };

  // --minimum-dependency-age 0: see the identical flag in pack.ts.
  const args = [
    "run",
    "-A",
    "-q",
    "--minimum-dependency-age",
    "0",
    kitEntry,
    "--name",
    shipName,
    "--output-name",
    outputName,
    "--package-name",
    packageName,
    "--version",
    version,
    "--options",
    JSON.stringify(publishOptions),
    "--vars",
    JSON.stringify(varOverrides),
  ];
  return { kitDir, kitEntry, denoExe, args, env };
}

/**
 * Resolves a pack kit's `publish.ts` entry point by name and spawns it with
 * the standard publish kit CLI contract — the publish counterpart to
 * `runPack`. Operates on an artifact `ens pack` already produced locally
 * (an image tag, typically); it doesn't build or pack anything itself.
 * Asks the kit's `authorize.ts` first and throws `PublishUnauthorizedError`
 * without publishing when this machine may not publish there — whoever
 * calls it, a release or a standalone `ens publish`.
 */
export async function runPublish(
  shipName: string,
  kit: string,
  options: RunPublishOptions,
  ports: Ports,
): Promise<number> {
  const authorization = await runPublishAuthorization(
    shipName,
    kit,
    options,
    ports,
  );
  if (!authorization.granted) {
    throw new PublishUnauthorizedError([{
      publish: `${shipName} → ${options.target}`,
      reason: authorization.reason ?? "refused",
    }]);
  }

  const invocation = await preparePublish(
    shipName,
    kit,
    "publish.ts",
    options,
    ports,
  );
  const { kitDir, denoExe, args, env } = invocation;
  return await ports.process.run(denoExe, args, { cwd: kitDir, env });
}

/**
 * Asks a pack kit's `authorize.ts` whether this machine may perform the
 * publish `runPublish` would, with the same arguments and credentials but
 * without touching the destination. A kit without `authorize.ts` can't vouch
 * for it, so that's a denial, not a pass.
 */
export async function runPublishAuthorization(
  shipName: string,
  kit: string,
  options: RunPublishOptions,
  ports: Ports,
): Promise<Authorization> {
  const invocation = await preparePublish(
    shipName,
    kit,
    "authorize.ts",
    options,
    ports,
  );
  if (!await exists(invocation.kitEntry, { isFile: true })) {
    return {
      granted: false,
      reason:
        `pack kit "${kit}" has no authorize.ts, so it can't verify this machine may publish to "${options.target}".`,
    };
  }
  const { kitDir, denoExe, args, env } = invocation;
  return authorizationFrom(
    await ports.process.probe(denoExe, args, { cwd: kitDir, env }),
  );
}
