import { parseArgs } from "@std/cli/parse-args";
import { requireFlag } from "./util.ts";

/** The parameters `ens` passes to a lib kit's `main.ts` invocation. */
export interface Context {
  /** Absolute path to the library's directory (a `source/libs/<name>` or core library). */
  libRoot: string;
  /** The package name to publish under (`lib.yml`'s `package`). */
  package: string;
  /** Version to publish this library under. */
  version: string;
  /** The named destination within this kit's own publish surface (`lib.yml`'s `publish[].target`) — present only for a kit with more than one. */
  target?: string;
}

/** Parses the standard lib kit CLI contract. Call this from a lib kit's `main.ts` entry point. */
export function getContext(args: string[] = Deno.args): Context {
  const flags = parseArgs(args, {
    string: ["lib-root", "package", "version", "target"],
  });

  const target = typeof flags.target === "string" && flags.target.length > 0
    ? flags.target
    : undefined;

  return {
    libRoot: requireFlag(flags, "lib-root"),
    package: requireFlag(flags, "package"),
    version: requireFlag(flags, "version"),
    target,
  };
}
