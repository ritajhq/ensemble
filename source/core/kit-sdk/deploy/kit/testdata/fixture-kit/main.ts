import type { Kit } from "../../kit.ts";

/** A minimal fixture kit used only by `loader.test.ts` — not a real target. */
const kit: Kit = {
  provisioners: () => [{ matches: () => true }],
  realization: () => ({
    classPreset: () => undefined,
    defaultFor: () => undefined,
    boundFor: () => undefined,
    supportsCapability: () => false,
    knowabilityOf: () => "static",
  }),
};

export default kit;
