import { join } from "@std/path";
import { exists } from "@std/fs";
import { parse as parseYaml } from "@std/yaml";

/**
 * A ship's `tauri.yml`: what the Tauri app is made of.
 *
 *     shell: apps/desktop      # the app under source/apps with Cargo.toml and tauri.conf.json
 *     frontend: web            # the build whose output the app embeds (optional)
 *     bundles: [deb, appimage] # installer mode only
 */
export class ShipConfig {
  private constructor(
    readonly shell: string,
    readonly frontend: string | undefined,
    readonly bundles: readonly string[],
  ) {}

  static async read(shipDir: string): Promise<ShipConfig> {
    const path = join(shipDir, "tauri.yml");
    if (!await exists(path, { isFile: true })) throw new Error(`Missing tauri.yml at ${path}`);
    const raw = parseYaml(await Deno.readTextFile(path)) as Record<string, unknown> | null;
    return ShipConfig.from(raw ?? {}, path);
  }

  private static from(raw: Record<string, unknown>, path: string): ShipConfig {
    const unknown = Object.keys(raw).filter((key) => !["shell", "frontend", "bundles"].includes(key));
    if (unknown.length > 0) throw new Error(`${path}: unknown key ${unknown.join(", ")} (expected shell, frontend, bundles).`);
    if (typeof raw.shell !== "string" || raw.shell.length === 0) {
      throw new Error(`${path}: "shell" is required: the app under source/apps that holds the Rust crate.`);
    }
    if (raw.frontend !== undefined && typeof raw.frontend !== "string") {
      throw new Error(`${path}: "frontend" must name a build.`);
    }
    const bundles = raw.bundles ?? [];
    if (!Array.isArray(bundles) || bundles.some((bundle) => typeof bundle !== "string")) {
      throw new Error(`${path}: "bundles" must be a list of bundle names.`);
    }
    return new ShipConfig(raw.shell, raw.frontend as string | undefined, bundles as string[]);
  }
}
