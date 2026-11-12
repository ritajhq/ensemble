import { join } from "@std/path";
import { parse as parseYaml } from "@std/yaml";
import type * as Website from "@ensemble/website";

/** The roles in the order the kits page lists them: the order `ens` runs them in. */
const ROLES: readonly Website.KitRole[] = [
  "build",
  "pack",
  "deploy",
  "ecosystem",
  "lib",
];

/** A kit folder's name, as `ens kit new` allows it. */
const KIT_NAME = /^[A-Za-z0-9._-]+$/;

/** The resource type a deploy kit's provisioner matches on: `declaration.type === "relational"`. */
const PROVISIONED_TYPE = /declaration\.type\s*===\s*"([a-z][a-z-]*)"/g;

/** The fields of a `kit.yml` the page shows, as parsed. */
interface KitYml {
  about?: {
    title?: string;
    summary?: string;
    icon?: string;
    tags?: string[];
    repository?: string;
  };
  modes?: Record<string, unknown>;
  publish?: Record<string, unknown>;
  ecosystem?: string;
}

/** What each role can tell about itself without running: read from its files, never declared, so it can't drift from the code. */
const FACTS: Record<
  Website.KitRole,
  (kitDir: string, yml: KitYml) => Promise<Website.KitFact[]>
> = {
  build: (_, yml) => Promise.resolve(ecosystemFact(yml)),
  pack: (_, yml) =>
    Promise.resolve([
      ...keysFact("Modes", yml.modes),
      ...keysFact("Publishes to", yml.publish),
    ]),
  deploy: async (kitDir) => await provisionedTypes(kitDir),
  ecosystem: () => Promise.resolve([]),
  lib: (_, yml) => Promise.resolve(keysFact("Publishes to", yml.publish)),
};

function ecosystemFact(yml: KitYml): Website.KitFact[] {
  return yml.ecosystem ? [{ label: "Ecosystem", values: [yml.ecosystem] }] : [];
}

function keysFact(
  label: string,
  map: Record<string, unknown> | undefined,
): Website.KitFact[] {
  const values = Object.keys(map ?? {});
  return values.length > 0 ? [{ label, values }] : [];
}

/** The resource types a deploy kit has provisioners for, from its provisioners' own source. */
async function provisionedTypes(kitDir: string): Promise<Website.KitFact[]> {
  const types = new Set<string>();
  const dir = join(kitDir, "provisioners");
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
      if (entry.name.endsWith(".test.ts")) continue;
      const source = await Deno.readTextFile(join(dir, entry.name));
      for (const [, type] of source.matchAll(PROVISIONED_TYPE)) types.add(type);
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  return types.size > 0
    ? [{ label: "Provisions", values: [...types].sort() }]
    : [];
}

/**
 * The kits published from a checkout of the repository's `.ensemble/kits`
 * folder: every kit whose `kit.yml` presents itself with an `about:` section.
 * A kit without one isn't meant to be listed.
 */
export class Catalog {
  constructor(private readonly root: string) {}

  async List(): Promise<Website.KitListing[]> {
    const listings: Website.KitListing[] = [];
    for (const role of ROLES) {
      for (const name of await this.names(role)) {
        const listing = await this.listing(role, name);
        if (listing) listings.push(listing);
      }
    }
    return listings;
  }

  /** A listed kit's icon, or none: only what the kit's own `about.icon` names is ever read. */
  async Icon(
    role: string,
    name: string,
  ): Promise<Uint8Array<ArrayBuffer> | undefined> {
    if (!ROLES.includes(role as Website.KitRole) || !KIT_NAME.test(name)) {
      return undefined;
    }
    const kitDir = join(this.root, role, name);
    const icon = (await this.yml(kitDir))?.about?.icon;
    if (!icon || !icon.endsWith(".svg") || icon.split(/[\\/]/).includes("..")) {
      return undefined;
    }
    return await Deno.readFile(join(kitDir, icon)).catch(() => undefined);
  }

  private async listing(
    role: Website.KitRole,
    name: string,
  ): Promise<Website.KitListing | undefined> {
    const kitDir = join(this.root, role, name);
    const yml = await this.yml(kitDir);
    const about = yml?.about;
    if (!yml || !about?.title || !about.summary) return undefined;
    return {
      role,
      name,
      title: about.title,
      summary: about.summary,
      iconUrl: about.icon ? `/kits/${role}/${name}/icon.svg` : undefined,
      tags: about.tags ?? [],
      facts: await FACTS[role](kitDir, yml),
      repository: about.repository,
    };
  }

  private async names(role: Website.KitRole): Promise<string[]> {
    const names: string[] = [];
    try {
      for await (const entry of Deno.readDir(join(this.root, role))) {
        if (entry.isDirectory && KIT_NAME.test(entry.name)) {
          names.push(entry.name);
        }
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    return names.sort();
  }

  private async yml(kitDir: string): Promise<KitYml | undefined> {
    try {
      return parseYaml(
        await Deno.readTextFile(join(kitDir, "kit.yml")),
      ) as KitYml;
    } catch {
      return undefined;
    }
  }
}
