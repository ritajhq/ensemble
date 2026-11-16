import { join } from "@std/path";
import type * as KitSdk from "@ensemble/kit-sdk";

/**
 * The packs a ship's Dockerfile copies from, named
 * `COPY --from=pack/<ship>/<kit> …`: another kit's output for a ship (often
 * this very one), which `ens pack` has to have made before this image is
 * built. Like an app a Dockerfile copies from, it is a named build context,
 * and nothing else says it is there.
 *
 * Each pack is asked for under an output name of its own, `<ship>.<kit>`, so
 * that what it wrote under the packages folder can't be mistaken for, or
 * cleared by, another pack of the same ship (a `local` image export writes
 * there too, under the ship's name).
 */
export class ReferencedPacks {
  static readonly #reference = /--from=pack\/(\S+)\/([^/\s]+)(?=\s)/g;

  /** The packs the Dockerfile of this ship copies from, each once, in the order it first does. */
  static async read(ship: string): Promise<KitSdk.Pack.PackDependency[]> {
    const dockerfile = await Deno.readTextFile(join(ship, "Dockerfile"));
    const found = new Map<string, KitSdk.Pack.PackDependency>();
    for (
      const [, packShip, kit] of dockerfile.matchAll(ReferencedPacks.#reference)
    ) {
      const name = ReferencedPacks.contextName(packShip, kit);
      found.set(name, {
        ship: packShip,
        kit,
        outputName: ReferencedPacks.outputName(packShip, kit),
      });
    }
    return [...found.values()];
  }

  /** What the Dockerfile writes after `--from=` to copy from this pack. */
  static contextName(ship: string, kit: string): string {
    return `pack/${ship}/${kit}`;
  }

  /** What the pack's output is called under the packages folder. */
  static outputName(ship: string, kit: string): string {
    return `${ship}.${kit}`;
  }
}
