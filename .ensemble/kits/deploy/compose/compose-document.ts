import * as KitSdk from "@ensemble/kit-sdk";

/** The categories that produce their own compose service — everything a `depends_on` edge could actually point at (release/secrets/variables/external never do, see render/renderer.ts's `UNRENDERED_CATEGORIES` and Section 12's release-as-image-tag-only model). */
const SERVICE_CATEGORIES: readonly string[] = [
  "compute",
  "storage",
  "databases",
  "messaging",
  "networking",
];

interface ComposeFragmentContent {
  readonly service: Record<string, unknown>;
  readonly volumes?: Readonly<Record<string, unknown>>;
}

/**
 * Assembles a render pass's `Artifacts` into one compose document:
 * `services:` in the order they were rendered (Appendix A itself lists
 * `primary` before `api` — dependency order, not alphabetical), each with
 * `depends_on` derived from the `DependencyGraph`'s reference edges (Section
 * 8's "compose depends_on" example of target-native apply ordering) filtered
 * to only the edges that point at another service; a top-level `volumes:`
 * collecting every fragment's own named volume, omitted entirely when
 * nothing declared one; and a top-level `networks:` naming every network any
 * service attaches to as `external: true` — the only way a network name
 * reaches a service today is a `${external.*}` reference (Section 5: ens
 * provisions no network of its own), so every one collected here is by
 * definition someone else's, never ens's to define.
 */
export function assembleComposeDocument(
  artifacts: KitSdk.Deploy.Render.Artifacts,
  graph: KitSdk.Deploy.Resolve.DependencyGraph,
): Record<string, unknown> {
  const services: Record<string, unknown> = {};
  const volumes: Record<string, unknown> = {};
  const networks: Record<string, unknown> = {};

  for (const fragment of artifacts.fragments) {
    const content = fragment.content as ComposeFragmentContent;
    const dependsOn = graph.dependenciesOf({
      category: fragment.category,
      name: fragment.name,
    })
      .filter((dependency) => SERVICE_CATEGORIES.includes(dependency.category))
      .map((dependency) => dependency.name)
      .sort();

    services[fragment.name] = dependsOn.length > 0
      ? { ...content.service, depends_on: dependsOn }
      : content.service;
    Object.assign(volumes, content.volumes ?? {});

    for (const name of (content.service.networks as string[] | undefined) ?? []) {
      networks[name] = { external: true };
    }
  }

  const document: Record<string, unknown> = { services };
  if (Object.keys(volumes).length > 0) document.volumes = volumes;
  if (Object.keys(networks).length > 0) document.networks = networks;
  return document;
}
