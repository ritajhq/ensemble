import { EnsembleConfigStore } from "../config.ts";
import { integrationOf } from "./integration-name.ts";

export * from "./integration-name.ts";

/** The deploy kits `app` has integrations for, as `config.yaml` declares them — none for an app built as itself. */
export async function integrationKitsOf(
  repoRoot: string,
  app: string,
): Promise<string[]> {
  const config = await new EnsembleConfigStore(repoRoot).loadOrEmpty();
  return Object.keys(config.build?.[app]?.integrations ?? {}).sort();
}

/**
 * What deploying with `kit` runs for `app`: its integration for that kit when
 * the app is a library built through integrations, the app itself when it's
 * a program on its own. A library with none for `kit` is an error, not a
 * reason to run it as it is — it has no main to run.
 */
export async function buildUnitFor(
  repoRoot: string,
  app: string,
  kit: string,
): Promise<string> {
  const kits = await integrationKitsOf(repoRoot, app);
  if (kits.length === 0) return app;
  if (!kits.includes(kit)) {
    throw new Error(
      `${app} is a library built through its integrations (${
        kits.join(", ")
      }), and has none for ${kit}: ` +
        `add build.${app}.integrations.${kit} to .ensemble/config.yaml and wire it at source/integrations/${kit}/${app}.`,
    );
  }
  return integrationOf(app, kit);
}
