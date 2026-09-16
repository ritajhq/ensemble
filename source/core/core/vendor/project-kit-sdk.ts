import { join } from "@std/path";
import { exists } from "@std/fs";

/** Reads the project's own resolved `@ensemble/kit-sdk` version from its `deno.lock` — the version a kit's `kitSdk` range is checked against (Section 5 of the vendoring build plan), shared by `KitInstaller` (at install time) and `KitPinner` (at pin/update time). */
export async function resolveProjectKitSdkVersion(
  repoRoot: string,
): Promise<string> {
  const lockPath = join(repoRoot, "deno.lock");
  if (!await exists(lockPath, { isFile: true })) {
    throw new Error(
      `Could not resolve this project's kit-sdk version: no deno.lock found at ${lockPath}.`,
    );
  }
  const lock = JSON.parse(await Deno.readTextFile(lockPath)) as {
    specifiers?: Record<string, string>;
  };
  const entry = Object.entries(lock.specifiers ?? {}).find(([key]) =>
    key.startsWith("jsr:@ensemble/kit-sdk@")
  );
  if (!entry) {
    throw new Error(
      `Could not resolve this project's kit-sdk version from ${lockPath} — is "@ensemble/kit-sdk" a dependency?`,
    );
  }
  return entry[1];
}
