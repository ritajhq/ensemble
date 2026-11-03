import { join } from "@std/path";
import { parse as parseYaml } from "@std/yaml";
import { type Role, ROLES } from "../kit-roles.ts";

export { type Role, ROLES };

/**
 * The versions of the contract between `ens` and a kit that this `ens` speaks:
 * the CLI flags, RPC messages and context a kit receives. A new one is only
 * for a breaking change — a new optional flag is ignored by a kit that doesn't
 * know it.
 */
export const SUPPORTED_PROTOCOLS: readonly number[] = [1];

/** The fields of a kit's `kit.yml` the vendoring flow validates a kit by. */
export interface Manifest {
  role: Role;
  protocol: number;
  /** Whether the kit declares any `publish:` targets, which its `publish.ts` then has to serve. */
  publishes: boolean;
}

function assertSupported(protocol: unknown, path: string): void {
  if (SUPPORTED_PROTOCOLS.includes(protocol as number)) return;
  throw new Error(
    `Kit manifest at ${path} declares protocol ${
      JSON.stringify(protocol)
    }, but this ens speaks ${
      SUPPORTED_PROTOCOLS.join(", ")
    }. Move the kit to a compatible ref, or update ens.`,
  );
}

/**
 * Reads and validates a kit's manifest from its `kit.yml` at `kitDir`, for a
 * kit entering or leaving this project. This is deliberately its own reader
 * rather than reusing `@ensemble/kit-sdk`'s `Pack.loadModes`/
 * `loadPublishModes` (which parse different keys — `modes`/`publish` — for a
 * running pack kit's own use, not for installing one): the two are kept
 * separate for now, with a later pass intended to check whether they've
 * converged enough to share one `kit.yml` parser.
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

  const protocol = parsed?.protocol;
  if (protocol === undefined) {
    throw new Error(`Kit manifest at ${path} is missing a "protocol" version.`);
  }
  assertSupported(protocol, path);

  return {
    role: role as Role,
    protocol: protocol as number,
    publishes: Boolean(parsed?.publish),
  };
}

/**
 * Refuses to launch a kit declaring a protocol this `ens` doesn't speak, so
 * upgrading `ens` past a vendored kit reads as that rather than as the kit
 * failing strangely. A kit declaring none still runs: it may have been
 * vendored before `protocol` existed, and only entering or leaving the project
 * through `read` requires it.
 */
export async function assertRunnable(kitDir: string): Promise<void> {
  const path = join(kitDir, "kit.yml");
  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return;
    throw error;
  }
  const protocol = (parseYaml(text) as Record<string, unknown> | null)
    ?.protocol;
  if (protocol === undefined) return;
  assertSupported(protocol, path);
}

/**
 * The ecosystem a kit's apps have to belong to, from its optional `ecosystem`
 * key: a project using the kit declares it, so that those apps are members of
 * its workspace. A kit with no `kit.yml` may predate one, and needs nothing.
 */
export async function ecosystemOf(kitDir: string): Promise<string | undefined> {
  let text: string;
  try {
    text = await Deno.readTextFile(join(kitDir, "kit.yml"));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw error;
  }
  const ecosystem = (parseYaml(text) as Record<string, unknown> | null)
    ?.ecosystem;
  return typeof ecosystem === "string" ? ecosystem : undefined;
}

/** The entrypoint file(s) a kit with this manifest must have present. Presence-only validation — never full interface/type conformance against the role's port. */
export function requiredEntrypoints(
  manifest: Pick<Manifest, "publishes">,
): readonly string[] {
  return manifest.publishes ? ["main.ts", "publish.ts"] : ["main.ts"];
}
