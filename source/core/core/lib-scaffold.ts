import { join } from "@std/path";
import { exists } from "@std/fs";
import type { Ports } from "./ports.ts";
import { EnsembleConfigStore } from "./config.ts";
import { Project } from "./ecosystem/index.ts";

const LIB_NAME_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9._\-/]*[a-zA-Z0-9])?$/;

/**
 * Scaffolds a new library at `source/libs/<name>`: a new workspace
 * member with version `0.0.1`, then registers a `publish.libs[]` entry for it in
 * `.ensemble/config.yaml` via `EnsembleConfigStore.setLibPackage` — so the lib is immediately
 * publishable with `ens lib publish`, with no manifest file living inside
 * the library's own directory.
 */
export async function runLibNew(
  name: string,
  ports: Ports,
  ecosystem?: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!LIB_NAME_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid lib name "${name}" — expected letters, digits, ".", "_", "-", or "/", ` +
        `not starting or ending with a separator.`,
    );
  }

  const repoRoot = await ports.repo.findRepoRoot();
  const libDir = join(repoRoot, "source", "libs", trimmed);
  if (await exists(libDir)) {
    throw new Error(`"${libDir}" already exists.`);
  }

  const project = await Project.load(repoRoot, ports);
  await project.named(ecosystem).scaffoldLibrary(libDir, trimmed);

  await new EnsembleConfigStore(repoRoot).setLibPackage(trimmed, trimmed);
}
