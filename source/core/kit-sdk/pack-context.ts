import { parseArgs } from "@std/cli/parse-args";
import { join } from "@std/path";
import { parse as parseYaml } from "@std/yaml";
import { requireFlag } from "./util.ts";

/** The parameters ens passes to every pack kit invocation. */
export interface Context {
  /** Absolute path to the ship's directory. */
  ship: string;
  /** Ship name, i.e. its path inside `ship/` (e.g. "web/spa"). */
  name: string;
  /** Name to give the packed output (e.g. an image tag or archive basename). Defaults to `name`. */
  outputName: string;
  /** True if --output-name was explicitly passed (vs. defaulted to `name`) — lets a kit's own output-naming config (e.g. compile.yml's `output:`) be overridden by the CLI flag when present. */
  outputNameExplicit: boolean;
  /** Absolute path to the `artifacts/` folder. */
  artifacts: string;
  /** Absolute path to the `artifacts/packages/` folder. */
  packages: string;
  /** Names of every app declared under `build:` in `.ensemble/config.yaml` (e.g. "server", "demo/spa"). */
  apps: string[];
  /** Mode name, validated against the kit's own `kit.yml`. */
  mode: string;
  /** Resolved pack vars (envs/pack/<name>.env, name being the ship name). */
  vars: Record<string, string>;
  /** True when --watch was passed. Kits that don't support watch mode can ignore this. */
  watch: boolean;
  /** Path a kit may write a `Result` to (via `writeResult`) before exiting, reporting back which of `apps` it actually depended on. Optional to write — a kit with nothing to report can leave it untouched. */
  resultFile: string;
}

/** What a pack kit reports back to `ens` about its own run, written to `Context.resultFile`. */
export interface Result {
  /** The subset of `Context.apps` this kit's run actually depended on (e.g. Dockerfile `COPY --from=<app>` references it found). */
  artifacts: string[];
}

/** Writes a kit's `Result` to `Context.resultFile`. Call this from a pack kit's entry point before exiting, if it has artifacts to report. */
export async function writeResult(ctx: Context, result: Result): Promise<void> {
  await Deno.writeTextFile(ctx.resultFile, JSON.stringify(result));
}

function parseVars(raw: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid --vars JSON payload: ${raw}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid --vars JSON payload: expected an object, got ${raw}`);
  }
  return parsed as Record<string, string>;
}

function parseApps(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid --apps JSON payload: ${raw}`);
  }
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    throw new Error(`Invalid --apps JSON payload: expected an array of strings, got ${raw}`);
  }
  return parsed as string[];
}

/** Parses the standard pack kit CLI contract. Call this from a pack kit's entry point. */
export function getContext(args: string[] = Deno.args): Context {
  const flags = parseArgs(args, {
    string: ["name", "output-name", "artifacts", "packages", "mode", "vars", "apps", "result-file"],
    boolean: ["watch"],
    default: { vars: "{}", apps: "[]", watch: false },
  });

  const ship = String(flags._[0] ?? "");
  if (!ship) {
    throw new Error("Missing required ship directory argument for kit invocation.");
  }

  const name = requireFlag(flags, "name");
  const outputNameFlag = typeof flags["output-name"] === "string" && flags["output-name"].length > 0
    ? flags["output-name"]
    : undefined;
  return {
    ship,
    name,
    outputName: outputNameFlag ?? name,
    outputNameExplicit: outputNameFlag !== undefined,
    artifacts: requireFlag(flags, "artifacts"),
    packages: requireFlag(flags, "packages"),
    mode: requireFlag(flags, "mode"),
    vars: parseVars(flags.vars),
    apps: parseApps(flags.apps),
    watch: flags.watch,
    resultFile: requireFlag(flags, "result-file"),
  };
}

async function loadKitManifestMap(
  kitDir: string,
  key: "modes" | "publish",
): Promise<Record<string, string>> {
  const path = join(kitDir, "kit.yml");
  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch {
    throw new Error(`Kit manifest not found at ${path}`);
  }

  const parsed = parseYaml(text) as Record<string, unknown> | null;
  const value = parsed?.[key];
  // A kit may legitimately declare only one of `modes`/`publish` (e.g. the
  // deno.compile kit is config-file-driven and has no modes, only a publish
  // target) — an absent key is an empty map, not an error. A present-but-
  // malformed value still is.
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Kit manifest at ${path} has a "${key}" that isn't a map.`);
  }
  return value as Record<string, string>;
}

/** Reads the `modes` map declared in a pack kit's own `kit.yml` manifest — an empty map if the kit declares none. */
export async function loadModes(kitDir: string): Promise<Record<string, string>> {
  return await loadKitManifestMap(kitDir, "modes");
}

/** Reads the `publish` map declared in a pack kit's own `kit.yml` manifest — the set of publish targets the kit's `publish.ts` supports (keys), each mapped to a short human description (values, for `ens` to list). Option *values* come per-release from the delivery manifest's `publish:` block, not from here. Empty if the kit declares none. */
export async function loadPublishModes(kitDir: string): Promise<Record<string, string>> {
  return await loadKitManifestMap(kitDir, "publish");
}

/** The parameters `ens` passes to a pack kit's `publish.ts` invocation. */
export interface PublishContext {
  /** Ship name, i.e. its path inside `ship/` (e.g. "web/spa"). */
  name: string;
  /** Name of the local packed artifact the kit resolves its input from (e.g. the local image tag `ens pack` produced). Defaults to `name`. */
  outputName: string;
  /** The name to publish the artifact under — kit-owned meaning (remote image name, uploaded release asset name, …). Defaults to `outputName`. Kits decide whether to fold `version` into it. */
  packageName: string;
  /** Version to publish this artifact under. */
  version: string;
  /** The publish options for this target — every `publish:` property other than `target`/`name` from the release's delivery manifest (e.g. `{ registry: "registry.example.com/org" }`). Entirely kit-owned: each kit reads the keys it understands. */
  options: Record<string, string>;
  /** Resolved publish vars (currently just `--var` overrides — no env-file tier yet, since publish credentials come from the process environment, see @ensemble/core's PUBLISH_ENV_PATH). */
  vars: Record<string, string>;
}

/** Parses the standard pack kit publish CLI contract. Call this from a pack kit's `publish.ts` entry point. */
export function getPublishContext(args: string[] = Deno.args): PublishContext {
  const flags = parseArgs(args, {
    string: ["name", "output-name", "package-name", "version", "options", "vars"],
    default: { vars: "{}", options: "{}" },
  });

  return {
    name: requireFlag(flags, "name"),
    outputName: requireFlag(flags, "output-name"),
    packageName: requireFlag(flags, "package-name"),
    version: requireFlag(flags, "version"),
    options: parseVars(flags.options),
    vars: parseVars(flags.vars),
  };
}
