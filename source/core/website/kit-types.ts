/** What a kit does for `ens`: the contract it speaks. */
export type KitRole = "build" | "pack" | "deploy" | "lib" | "ecosystem";

/** One thing a kit can be told about, read from the kit itself (its provisioners, its `modes`, its `publish` targets). */
export interface KitFact {
  label: string;
  values: string[];
}

/** One kit, as the kits page lists it: its `about:` section, plus what's read from the kit itself. */
export interface KitListing {
  role: KitRole;
  name: string;
  title: string;
  summary: string;
  /** Where the page loads the kit's icon from; none when the kit declares none. */
  iconUrl?: string;
  tags: string[];
  facts: KitFact[];
  /** Where it's published for `ens kit install`; none for a kit that comes with `ens init`. */
  repository?: string;
}
