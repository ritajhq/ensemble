import { join } from "@std/path";
import { exists } from "@std/fs";
import { EnsembleConfigStore } from "../config.ts";

/**
 * An integration is an app's wiring for one deploy kit: the code that builds
 * the app's ports from that platform's runtime and resources and hands the
 * platform its entry — `source/integrations/<kit>/<app>`, keeping the app
 * itself free of any platform. It's built like an app, under this name (its
 * output at `source/artifacts/integrations/<kit>/<app>`, its build kit at
 * `build.integrations/<kit>/<app>` in `.ensemble/config.yaml`), and wherever
 * an app is named for what a deployment runs — a release's ship, a
 * `development.sync` rule — the kit deploying runs that app's integration
 * for it, if the project has one, and the app's own build if not: an app
 * that runs on one platform as it is needs no integration at all. The
 * `integrations/` prefix is reserved for them: no app is named under it.
 */
const ROOT = "integrations";

/** An integration's two halves: the deploy kit it's wired for, and the app it wires. */
export interface Integration {
  readonly kit: string;
  readonly app: string;
}

/** The build unit `app`'s integration for `kit` is built as. */
export function integrationOf(app: string, kit: string): string {
  return `${ROOT}/${kit}/${app}`;
}

/** `name` read as an integration — `integrations/<kit>/<app>`, the app possibly nested — or `undefined` for an app's name. */
export function parseIntegration(name: string): Integration | undefined {
  const [root, kit, ...app] = name.split("/");
  if (root !== ROOT || !kit || app.length === 0) return undefined;
  if (app.some((segment) => segment === "")) return undefined;
  return { kit, app: app.join("/") };
}

/** Whether a build unit's name is an integration's rather than an app's. */
export function isIntegration(name: string): boolean {
  return parseIntegration(name) !== undefined;
}

/** Whether `name` is under the prefix integrations own, so no app may take it. */
export function isReserved(name: string): boolean {
  return name === ROOT || name.startsWith(`${ROOT}/`);
}

/** Where a build unit's source lives under `source/`: its integration's folder, or the app's. */
export function sourceDirOf(workspace: string, name: string): string {
  return isIntegration(name)
    ? join(workspace, name)
    : join(workspace, "apps", name);
}

/**
 * What deploying with `kit` runs for `app`: its integration for that kit when
 * the project has one, the app itself otherwise. An integration's folder with
 * no build entry to build it with is a mistake, not a reason to quietly run
 * the app instead — the platform would get code the project means to replace.
 */
export async function buildUnitFor(
  repoRoot: string,
  app: string,
  kit: string,
): Promise<string> {
  const integration = integrationOf(app, kit);
  const folder = join(repoRoot, "source", integration);
  if (!await exists(folder, { isDirectory: true })) return app;
  const config = await new EnsembleConfigStore(repoRoot).loadOrEmpty();
  if (!config.build?.[integration]) {
    throw new Error(
      `source/${integration} wires ${app} for ${kit}, but .ensemble/config.yaml has no "build.${integration}" entry to build it with.`,
    );
  }
  return integration;
}
