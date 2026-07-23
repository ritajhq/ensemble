import { parseArgs } from "@std/cli/parse-args";
import { requireFlag } from "./util.ts";

export type BuildMode = "development" | "production";

/** The parameters ens passes to every build kit invocation. */
export interface KitContext {
  /** Absolute path to the package's source directory. */
  source: string;
  /** Package name, i.e. its path inside `apps/` (e.g. "my-app/client"). */
  name: string;
  /** Absolute path to the directory the kit should write its build output to. */
  out: string;
  mode: BuildMode;
  watch: boolean;
  /** Absolute path to the `source/` workspace root. */
  workspace: string;
  /** Resolved build vars (envs/build/<name>.env merged with --var overrides). */
  vars: Record<string, string>;
}

const REQUIRED_STRING_FLAGS = ["source", "name", "out", "mode", "workspace"] as const;

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

/** Parses the standard build kit CLI contract. Call this from a build kit's entry point. */
export function getKitContext(args: string[] = Deno.args): KitContext {
  const flags = parseArgs(args, {
    string: [...REQUIRED_STRING_FLAGS, "vars"],
    boolean: ["watch"],
    default: { watch: false, vars: "{}" },
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
    vars: parseVars(flags.vars),
  };
}
