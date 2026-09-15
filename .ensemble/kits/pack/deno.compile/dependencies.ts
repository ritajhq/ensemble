import { join } from "@std/path";
import { exists } from "@std/fs";
import { parse as parseYaml } from "@std/yaml";
import * as KitSdk from "@ensemble/kit-sdk";

// Read-only: reports which candidate app this ship's compile.yml actually
// names as its `source` — deno.compile packs exactly one app, so it never
// depends on any of the others `ens` offers as candidates. Without this,
// `resolvePackDependencies` had nothing to ask and fell back to "every
// declared app", making this ship's pack rebuild apps it has nothing to do
// with.
const ctx = KitSdk.Pack.getDependenciesContext();

const configPath = join(ctx.ship, "compile.yml");
if (!await exists(configPath, { isFile: true })) {
  throw new Error(`Missing compile.yml at ${configPath}`);
}
const config = parseYaml(await Deno.readTextFile(configPath)) as {
  source?: unknown;
};
if (typeof config.source !== "string" || config.source.length === 0) {
  throw new Error(
    `compile.yml: "source" is required and must name an app under source/apps/.`,
  );
}

const dependencies = ctx.apps.includes(config.source) ? [config.source] : [];

console.log(
  JSON.stringify({ artifacts: dependencies } satisfies KitSdk.Pack.Result),
);
