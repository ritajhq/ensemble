import { join } from "@std/path";
import { parse as parseYaml } from "@std/yaml";

export type Role = "build" | "pack" | "deploy" | "lib";

/** Every known kit role — the same four `.ensemble/kits/<role>` directories `ens init` has always populated. */
export const ROLES: readonly Role[] = ["build", "pack", "deploy", "lib"];

/** The `role`/`kitSdk` fields of a kit's `kit.yml`, as read by the vendoring flow. */
export interface Manifest {
  role: Role;
  kitSdk: string;
}

const REQUIRED_ENTRYPOINTS_BY_ROLE: Record<Role, readonly string[]> = {
  build: ["main.ts"],
  pack: ["main.ts", "publish.ts"],
  deploy: ["main.ts"],
  lib: ["main.ts"],
};

/**
 * Reads and validates a kit's `role` and `kitSdk` fields from its `kit.yml`
 * at `kitDir`. This is deliberately its own reader rather than reusing
 * `@ensemble/kit-sdk`'s `Pack.loadModes`/`loadPublishModes` (which parse
 * different keys — `modes`/`publish` — for a running pack kit's own use, not
 * for installing one): the two are kept separate for now, with a later pass
 * intended to check whether they've converged enough to share one `kit.yml`
 * parser.
 */
export async function read(kitDir: string): Promise<Manifest> {
  const path = join(kitDir, "kit.yml");
  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch {
    throw new Error(`Kit manifest not found at ${path}`);
  }

  const parsed = parseYaml(text) as Record<string, unknown> | null;

  const role = parsed?.role;
  if (typeof role !== "string" || !ROLES.includes(role as Role)) {
    throw new Error(
      `Kit manifest at ${path} has an invalid "role" (got ${
        JSON.stringify(role)
      }); expected one of ${ROLES.join(", ")}.`,
    );
  }

  const kitSdk = parsed?.kitSdk;
  if (typeof kitSdk !== "string" || kitSdk.trim().length === 0) {
    throw new Error(
      `Kit manifest at ${path} is missing a "kitSdk" version range.`,
    );
  }

  return { role: role as Role, kitSdk };
}

/** The entrypoint file(s) a kit of this role must have present. Presence-only validation — never full interface/type conformance against the role's port. */
export function requiredEntrypoints(role: Role): readonly string[] {
  return REQUIRED_ENTRYPOINTS_BY_ROLE[role];
}
