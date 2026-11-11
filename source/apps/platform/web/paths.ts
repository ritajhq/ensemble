/**
 * Where each screen lives. Import as a namespace (`import * as Paths`):
 * `Paths.project(id)`.
 */

export const overview = "/";

export const newProject = "/new";

export const projects = "/projects";

export const deployments = "/deployments";

export const github = "/integrations/github";

export function project(id: string): string {
  return `/projects/${encodeURIComponent(id)}`;
}

export function run(id: string): string {
  return `/runs/${encodeURIComponent(id)}`;
}

/**
 * The path a link from before the router names: `#/projects/<id>` was the
 * platform's URL until it moved to plain paths, and bookmarks still carry it.
 * Undefined when `hash` isn't one.
 */
export function fromLegacyHash(hash: string): string | undefined {
  return hash.startsWith("#/") ? hash.slice(1) : undefined;
}
