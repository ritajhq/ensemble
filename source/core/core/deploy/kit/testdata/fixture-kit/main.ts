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
  provisioners: () => Promise.resolve([{ matches: () => Promise.resolve(true) }]),
  realization: () =>
    Promise.resolve({
      classPreset: () => Promise.resolve(undefined),
      defaultFor: () => Promise.resolve(undefined),
      boundFor: () => Promise.resolve(undefined),
      supportsCapability: () => Promise.resolve(false),
      knowabilityOf: () => Promise.resolve("static"),
    }),
  present: () => Promise.resolve({ filename: "fixture.txt", content: "" }),
  applyCommand: () => Promise.resolve(["fixture-apply"]),
  watchCommand: () => Promise.resolve(["fixture-watch"]),
  emulateExternals: () =>
    Promise.resolve([{
      name: "fixture-external",
      check: ["fixture-check"],
      create: ["fixture-create"],
    }]),
};

export default kit;
