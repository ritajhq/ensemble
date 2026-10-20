import { join } from "@std/path";
import { exists } from "@std/fs";

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
 * that runs on one platform as it is needs no integration at all.
 */
const ROOT = "integrations";

/** The build unit `app`'s integration for `kit` is built as. */
export function integrationOf(app: string, kit: string): string {
  return `${ROOT}/${kit}/${app}`;
}

/** Whether a build unit's name is an integration's rather than an app's. */
export function isIntegration(name: string): boolean {
  return name.startsWith(`${ROOT}/`);
}

/** Where a build unit's source lives under `source/`: its integration's folder, or the app's. */
export function sourceDirOf(workspace: string, name: string): string {
  return isIntegration(name)
    ? join(workspace, name)
    : join(workspace, "apps", name);
}

/** What deploying with `kit` runs for `app`: its integration for that kit when the project has one, the app itself otherwise. */
export async function buildUnitFor(
  repoRoot: string,
  app: string,
  kit: string,
): Promise<string> {
  const integration = integrationOf(app, kit);
  return await exists(join(repoRoot, "source", integration), {
      isDirectory: true,
    })
    ? integration
    : app;
}
