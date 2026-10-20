import { unzipSync, type Zippable, zipSync } from "fflate";

/** The bundle's own entry for this kit (`function.v1`: one ES module per platform, named after its deploy kit). */
export const ENTRY = "aws.js";
const ADAPTER = "ensemble-lambda.mjs";
/** The function's `Handler`: the adapter's export, never the bundle's. */
export const HANDLER = "ensemble-lambda.handler";
const MODULE_MARKER = "package.json";

// A fixed timestamp (zip's own earliest), so the same bundle always adapts to
// the same bytes — the function pack kit zips the same way.
const REPRODUCIBLE_MTIME = new Date("1980-01-01T00:00:00Z");

const ADAPTER_SOURCE = Deno.readFileSync(
  new URL("./runtime/ensemble-lambda.mjs", import.meta.url),
);

/**
 * Makes a function bundle runnable by Lambda: adds the handler that adapts
 * API Gateway's events to the bundle's `aws.js` (`./runtime/`), and marks its
 * modules as ES modules if the bundle doesn't already, Node telling them
 * apart by the nearest package.json. Done to every bundle the kit deploys,
 * packed or synced, so no bundle has to know about Lambda.
 */
export class FunctionAdapter {
  /** `files` (paths in the bundle → contents) with the adapter in, or why they can't run here. */
  adaptFiles(files: Zippable): Zippable {
    if (!(ENTRY in files)) {
      throw new Error(
        `The function's bundle has no ${ENTRY} at its root: function.v1 bundles carry one ES module per platform they run on, named after its deploy kit.`,
      );
    }
    return {
      ...files,
      [ADAPTER]: ADAPTER_SOURCE,
      ...(MODULE_MARKER in files ? {} : {
        [MODULE_MARKER]: new TextEncoder().encode(`{ "type": "module" }\n`),
      }),
    };
  }

  /** A zipped bundle, adapted. */
  adapt(zip: Uint8Array): Uint8Array {
    return this.zip(this.adaptFiles(unzipSync(zip)));
  }

  zip(files: Zippable): Uint8Array {
    return zipSync(files, { level: 9, mtime: REPRODUCIBLE_MTIME });
  }
}
