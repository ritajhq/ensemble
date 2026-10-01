import { parseArgs } from "@std/cli/parse-args";
import { requireFlag } from "./util.ts";

export type Mode = "development" | "production";

/** The parameters ens passes to every build kit invocation. */
export interface Context {
  /** Absolute path to the package's source directory. */
  source: string;
  /** Package name, i.e. its path inside `apps/` (e.g. "my-app/client"). */
  name: string;
  /** Absolute path to the directory the kit should write its build output to. */
  out: string;
  mode: Mode;
  watch: boolean;
  /** Absolute path to the `source/` workspace root. */
  workspace: string;
  /** Resolved build vars (envs/build/<name>.env merged with --var overrides). */
  vars: Record<string, string>;
  /** Static build variant from `config.yaml`'s `build.<name>.target`, for kits that support more than one shape of output (e.g. the `react` kit's "ssr"). Absent for apps that don't set one. */
  target?: string;
  /** Kit-interpreted settings from `config.yaml`'s `build.<name>.options`, passed through untouched. Empty for apps that don't set any. */
  options: Record<string, unknown>;
}

const REQUIRED_STRING_FLAGS = ["source", "name", "out", "mode", "workspace"] as const;

function parseJsonObject(flag: string, raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid --${flag} JSON payload: ${raw}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid --${flag} JSON payload: expected an object, got ${raw}`);
  }
  return parsed as Record<string, unknown>;
}

/** Parses the standard build kit CLI contract. Call this from a build kit's entry point. */
export function getContext(args: string[] = Deno.args): Context {
  const flags = parseArgs(args, {
    string: [...REQUIRED_STRING_FLAGS, "vars", "target", "options"],
    boolean: ["watch"],
    default: { watch: false, vars: "{}", options: "{}" },
  });

  const source = requireFlag(flags, "source");
  const name = requireFlag(flags, "name");
  const out = requireFlag(flags, "out");
  const workspace = requireFlag(flags, "workspace");
  const mode = requireFlag(flags, "mode");
  if (mode !== "development" && mode !== "production") {
    throw new Error(`Invalid --mode "${mode}", expected "development" or "production".`);
  }

  return {
    source,
    name,
    out,
    mode,
    watch: flags.watch,
    workspace,
    vars: parseJsonObject("vars", flags.vars) as Record<string, string>,
    target: flags.target,
    options: parseJsonObject("options", flags.options),
  };
}
