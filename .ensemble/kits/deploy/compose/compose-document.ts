import * as KitSdk from "@ensemble/kit-sdk";

interface ComposeFragmentContent {
  /** Absent for a resource with no compose service of its own — `storage.volume` (Section 5's `SERVICE_CATEGORIES` lists `storage` as a category that *can* produce one, not that every type in it does; a named volume is declared, never run). */
  readonly service?: Record<string, unknown>;
  readonly volumes?: Readonly<Record<string, unknown>>;
  /** A fragment's own top-level Compose `configs:` entries (inline `content:`, never `file:` — no host path exists to point at once this artifact leaves the render pass) — `networking.gateway`'s nginx.conf and `storage.object-storage`'s garage.toml/bootstrap script both feed this, same "declare it once at top level, reference it from the service" shape `volumes` already has. */
  readonly configs?: Readonly<Record<string, unknown>>;
}

/**
 * Assembles a render pass's `Artifacts` into one compose document:
 * `services:` in the order they were rendered (Appendix A itself lists
 * `primary` before `api` — dependency order, not alphabetical), each with
 * `depends_on` derived from the `DependencyGraph`'s reference edges (Section
 * 8's "compose depends_on" example of target-native apply ordering) filtered
 * to only the edges that point at a resource that actually produced a
 * compose service of its own — `storage.volume` (`provisioners/
 * storage-volume.ts`) is declared, not run, so a compute mounting one gets no
 * `depends_on` entry for it, only the top-level `volumes:` block it feeds
 * (below). Fragments render in dependency order (a batch's own resources
 * never depend on a later batch's), so by the time a dependent's own
 * `dependsOn` is computed, every dependency it could point at has already
 * been classified. A top-level `volumes:` collects every fragment's own
 * named volume, omitted entirely when nothing declared one; a top-level
 * `networks:` names every network any service attaches to as
 * `external: true` — the only way a network name reaches a service today is
 * a `${external.*}` reference (Section 5: ens provisions no network of its
 * own), so every one collected here is by definition someone else's, never
 * ens's to define — with one exception (`PROJECT_NETWORK` below), which a
 * service lists only to *add* compose's own implicit project network
 * alongside an external one, as the gateway does so it can reach the
 * services it routes to. A top-level `configs:` collects every fragment's own
 * inline config content (Caddyfile, garage.toml, ...), same "declare once,
 * reference by name from the service" shape as `volumes:`.
 */

/** Compose's own implicit per-project network: every service that declares no `networks` of its own is attached to it, and a service can list it explicitly to join it *in addition* to an external one. It is compose's to create, never ens's to declare `external: true` — so it never reaches the top-level `networks:` block, and the fragment's own service entry is left to reference it by this name. */
export const PROJECT_NETWORK = "default";
export function assembleComposeDocument(
  artifacts: KitSdk.Deploy.Render.Artifacts,
  graph: KitSdk.Deploy.Resolve.DependencyGraph,
): Record<string, unknown> {
  const services: Record<string, unknown> = {};
  const volumes: Record<string, unknown> = {};
  const networks: Record<string, unknown> = {};
  const configs: Record<string, unknown> = {};
  const serviceKeys = new Set<string>();

  for (const fragment of artifacts.fragments) {
    const content = fragment.content as ComposeFragmentContent;
    const dependsOn = graph.dependenciesOf({
      category: fragment.category,
      name: fragment.name,
    })
      .filter((dependency) =>
        serviceKeys.has(`${dependency.category}.${dependency.name}`)
      )
      .map((dependency) => dependency.name)
      .sort();

    if (content.service) {
      services[fragment.name] = dependsOn.length > 0
        ? { ...content.service, depends_on: dependsOn }
        : content.service;
      serviceKeys.add(`${fragment.category}.${fragment.name}`);

      for (
        const name of (content.service.networks as string[] | undefined) ?? []
      ) {
        if (name === PROJECT_NETWORK) continue;
        networks[name] = { external: true };
      }
    }
    Object.assign(volumes, content.volumes ?? {});
    Object.assign(configs, content.configs ?? {});
  }

  const document: Record<string, unknown> = { services };
  if (Object.keys(volumes).length > 0) document.volumes = volumes;
  if (Object.keys(networks).length > 0) document.networks = networks;
  if (Object.keys(configs).length > 0) document.configs = configs;
  return document;
}
