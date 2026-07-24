import { parseArgs } from "@std/cli/parse-args";
import { join } from "@std/path";
import { parse as parseYaml } from "@std/yaml";
import { requireFlag } from "./util.ts";

/** The parameters ens passes to every pack kit invocation. */
export interface PackKitContext {
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
  /** Mode name, validated against the kit's own `kit.yml`. */
  mode: string;
  /** Resolved pack vars (envs/pack/<name>.env, name being the ship name). */
  vars: Record<string, string>;
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

/** Parses the standard pack kit CLI contract. Call this from a pack kit's entry point. */
export function getPackKitContext(args: string[] = Deno.args): PackKitContext {
  const flags = parseArgs(args, {
    string: ["name", "output-name", "artifacts", "packages", "mode", "vars"],
    default: { vars: "{}" },
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
  };
}

/** Reads the `modes` map declared in a pack kit's own `kit.yml` manifest. */
export async function loadKitModes(kitDir: string): Promise<Record<string, string>> {
  const path = join(kitDir, "kit.yml");
  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch {
    throw new Error(`Kit manifest not found at ${path}`);
  }

  const parsed = parseYaml(text) as { modes?: unknown } | null;
  const modes = parsed?.modes;
  if (typeof modes !== "object" || modes === null || Array.isArray(modes)) {
    throw new Error(`Kit manifest at ${path} is missing a "modes" map.`);
  }
  return modes as Record<string, string>;
}
