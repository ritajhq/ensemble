import type { Kit } from "../../kit.ts";

/**
 * A minimal fixture kit used only by `loader.test.ts` — not a real target.
 * Declares every *optional* `Kit` capability (`watchCommand`,
 * `emulateExternals`) so a test can assert `KitLoader.configure()` actually
 * forwards each one through its wrapper object, not just the required
 * methods — the exact class of bug that let `emulateExternals` silently get
 * dropped until a real `--emulate-externals` run surfaced it.
 */
const kit: Kit = {
  provisioners: () => [{ matches: () => true }],
  realization: () => ({
    classPreset: () => undefined,
    defaultFor: () => undefined,
    boundFor: () => undefined,
    supportsCapability: () => false,
    knowabilityOf: () => "static",
  }),
  present: () => ({ filename: "fixture.txt", content: "" }),
  applyCommand: () => ["fixture-apply"],
  watchCommand: () => ["fixture-watch"],
  emulateExternals: () => [{
    name: "fixture-external",
    check: ["fixture-check"],
    create: ["fixture-create"],
  }],
};

export default kit;
