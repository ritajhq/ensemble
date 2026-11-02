import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import type { RepoLocator } from "./ports.ts";
import * as KitManifest from "./vendor/kit-manifest.ts";

const KIT_NAME_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;

function kitYmlTemplate(role: KitManifest.Role): string {
  return `role: ${role}\nprotocol: ${KitManifest.SUPPORTED_PROTOCOLS.at(-1)}\n`;
}

const DENO_JSON_TEMPLATE = `${
  JSON.stringify(
    { imports: { "@ensemble/kit-sdk": "jsr:@ensemble/kit-sdk" } },
    null,
    2,
  )
}\n`;

const STUB_ENTRYPOINT_TEMPLATE = `export {};\n`;

/**
 * Scaffolds a new kit at `.ensemble/kits/<role>/<name>`: a `kit.yml`
 * (`role`, and the newest `protocol` this `ens` speaks), a `deno.json`
 * importing `@ensemble/kit-sdk`, and a stub `main.ts` — same "just this for now"
 * minimalism as `ens lib new`'s stub `index.ts`.
 */
export async function runKitNew(
  name: string,
  role: KitManifest.Role,
  repo: RepoLocator,
): Promise<void> {
  const trimmed = name.trim();
  if (!KIT_NAME_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid kit name "${name}" — expected letters, digits, ".", "_", or "-", not starting or ending with a separator.`,
    );
  }
  if (!KitManifest.ROLES.includes(role)) {
    throw new Error(
      `Invalid kit role "${role}" — expected one of ${
        KitManifest.ROLES.join(", ")
      }.`,
    );
  }

  const repoRoot = await repo.findRepoRoot();
  const kitDir = join(repoRoot, ".ensemble", "kits", role, trimmed);
  if (await exists(kitDir)) {
    throw new Error(`"${kitDir}" already exists.`);
  }

  await ensureDir(kitDir);
  await Deno.writeTextFile(join(kitDir, "kit.yml"), kitYmlTemplate(role));
  await Deno.writeTextFile(join(kitDir, "deno.json"), DENO_JSON_TEMPLATE);
  await Deno.writeTextFile(join(kitDir, "main.ts"), STUB_ENTRYPOINT_TEMPLATE);
}
