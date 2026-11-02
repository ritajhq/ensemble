import type { Ecosystem } from "./ecosystem/index.ts";
import type { CoreLibRelease } from "./lib-release-cascade.ts";

/** A library together with the released libraries it needs published before it. */
interface Pending {
  readonly lib: CoreLibRelease;
  readonly name: string;
  readonly prerequisites: Set<string>;
}

/**
 * The order core libraries must reach their registries in: a registry refuses a
 * package whose dependency isn't there yet. Derived from the links each package's
 * own manifest states, so `publish.core` needn't be written in any special order,
 * and libraries nothing relates keep the order it lists them in.
 */
export class PublishOrder {
  constructor(private readonly ecosystem: Pick<Ecosystem, "packageAt">) {}

  async of(libs: readonly CoreLibRelease[]): Promise<CoreLibRelease[]> {
    let pending = await this.pendingFrom(libs);
    const ordered: CoreLibRelease[] = [];
    while (pending.length > 0) {
      const waiting = new Set(pending.map(({ name }) => name));
      const ready = pending.find(({ prerequisites }) =>
        ![...prerequisites].some((name) => waiting.has(name))
      );
      if (!ready) throw new Error(PublishOrder.cycleIn(pending));
      ordered.push(ready.lib);
      pending = pending.filter((entry) => entry !== ready);
    }
    return ordered;
  }

  private async pendingFrom(
    libs: readonly CoreLibRelease[],
  ): Promise<Pending[]> {
    const found = await Promise.all(libs.map(async (lib) => ({
      lib,
      manifest: await this.ecosystem.packageAt(lib.libRoot),
    })));
    return found.map(({ lib, manifest }) => ({
      lib,
      name: manifest?.name ?? lib.declaration.package,
      prerequisites: new Set(
        (manifest?.links ?? []).filter(({ devOnly }) => !devOnly)
          .map(({ target }) => target),
      ),
    }));
  }

  /** Every library left waits on another left, so following any of them must come back round. */
  private static cycleIn(pending: readonly Pending[]): string {
    const byName = new Map(pending.map((entry) => [entry.name, entry]));
    const path: string[] = [];
    let current = pending[0];
    while (!path.includes(current.name)) {
      path.push(current.name);
      const next = [...current.prerequisites].find((name) => byName.has(name))!;
      current = byName.get(next)!;
    }
    const cycle = [...path.slice(path.indexOf(current.name)), current.name];
    return `Core libraries depend on each other, so none can be published first: ${
      cycle.join(" -> ")
    }.`;
  }
}
