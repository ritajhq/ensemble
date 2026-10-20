import { join } from "@std/path";

/**
 * An integration is an app's wiring for one deploy kit: the code that builds
 * the app's ports from that platform's runtime and resources and hands the
 * platform its entry — `source/integrations/<kit>/<app>`, keeping the app
 * itself free of any platform. The app is then a library, declared under
 * `build.<app>.integrations.<deploy kit>` in `.ensemble/config.yaml` with the
 * build kit for each; each integration is built like an app, under the name
 * below (its output at `source/artifacts/integrations/<kit>/<app>`), and
 * wherever an app is named for what a deployment runs — a release's ship, a
 * `development.sync` rule — the kit deploying runs that app's integration
 * for it. An app with no integrations is a program on its own: it builds as
 * itself and runs as it is, whichever kit deploys it. The `integrations/`
 * prefix is reserved for them: no app is named under it.
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
  if (
    root !== ROOT || !kit || app.length === 0 ||
    app.some((segment) => segment === "")
  ) return undefined;
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
