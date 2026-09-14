import { EMPTY_KIT_CONFIG, type KitConfig } from "./config.ts";

/**
 * Converts a sidecar config file's already-parsed YAML into a `KitConfig`.
 * Kept separate from the file I/O (`KitLoader`) so this structural mapping is
 * unit-testable without touching disk. Deliberately light on validation: a
 * kit's `behavior` schema is the kit's own to define and check (Section 10),
 * not something the SDK enforces centrally — this only supplies the three
 * concerns' defaults when a file omits a section.
 */
export function parseKitConfig(raw: unknown): KitConfig {
  if (raw === null || raw === undefined) return EMPTY_KIT_CONFIG;
  const obj = raw as Record<string, unknown>;
  return {
    behavior: (obj.behavior as KitConfig["behavior"]) ??
      EMPTY_KIT_CONFIG.behavior,
    provisionerCatalog: {
      provisioners:
        (obj.provisioners as KitConfig["provisionerCatalog"]["provisioners"]) ??
          [],
    },
    targetValues: (obj.targetValues as KitConfig["targetValues"]) ??
      EMPTY_KIT_CONFIG.targetValues,
  };
}
