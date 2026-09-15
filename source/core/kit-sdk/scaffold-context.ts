import { parseArgs } from "@std/cli/parse-args";
import { requireFlag } from "./util.ts";

/** The parameters ens passes to every build kit's scaffold invocation. */
export interface Context {
  /** Absolute path to the directory the kit should scaffold the new app into. */
  dest: string;
  /** Package name, i.e. its path inside `apps/` (e.g. "my-app/client"). */
  name: string;
  /** Static build variant the app is being scaffolded for (e.g. the `react` kit's "ssr"), matching `Build.Context`'s `target`. Absent when the app doesn't set one. */
  target?: string;
}

/** Parses the standard scaffold kit CLI contract. Call this from a build kit's scaffold.ts entry point. */
export function getContext(args: string[] = Deno.args): Context {
  const flags = parseArgs(args, { string: ["dest", "name", "target"] });

  return {
    dest: requireFlag(flags, "dest"),
    name: requireFlag(flags, "name"),
    target: flags.target,
  };
}
