import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { findRepoRoot } from "./repo.ts";
import { EnsembleConfigStore } from "./config.ts";

const LIB_NAME_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9._\-/]*[a-zA-Z0-9])?$/;

function denoJsonTemplate(name: string): string {
  return `${
    JSON.stringify(
      {
        name,
        version: "0.0.1",
        exports: "./index.ts",
      },
      null,
      2,
    )
  }\n`;
}

const INDEX_TS_TEMPLATE = `export {};\n`;

/**
 * Scaffolds a new library at `source/libs/<name>`: a workspace-member
 * `deno.json` (name, version `0.0.1`, exporting `./index.ts`) and a stub
 * `index.ts`, then registers `libs.<name>.package` in `.ensemble/config.yaml`
 * via `EnsembleConfigStore.setLibPackage` — so the lib is immediately
 * publishable with `ens lib publish`, with no manifest file living inside
 * the library's own directory. `source/libs/**` is already a workspace
 * member glob (set up by `ens init`), so no separate workspace registration
 * step is needed.
 */
export async function runLibNew(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!LIB_NAME_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid lib name "${name}" — expected letters, digits, ".", "_", "-", or "/", ` +
        `not starting or ending with a separator.`,
    );
  }

  const repoRoot = await findRepoRoot();
  const libDir = join(repoRoot, "source", "libs", trimmed);
  if (await exists(libDir)) {
    throw new Error(`"${libDir}" already exists.`);
  }

  await ensureDir(libDir);
  await Deno.writeTextFile(
    join(libDir, "deno.json"),
    denoJsonTemplate(trimmed),
  );
  await Deno.writeTextFile(join(libDir, "index.ts"), INDEX_TS_TEMPLATE);

  await new EnsembleConfigStore(repoRoot).setLibPackage(trimmed, trimmed);
}
