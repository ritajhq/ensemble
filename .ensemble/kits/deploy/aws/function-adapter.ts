import { unzipSync, type Zippable, zipSync } from "fflate";
import * as KitSdk from "@ensemble/kit-sdk";

/** The bundle's entry (`function.v1`): the module whose default export answers requests. */
export const ENTRY = KitSdk.Entry.BUNDLE;
const ADAPTER = "ensemble-lambda.mjs";
/** The function's `Handler` for a bundle written for `function.v1`: the adapter's export. */
export const HANDLER = "ensemble-lambda.handler";
/** Its `Handler` for a native bundle (`Entry.NATIVE`): the bundle's own export, as Lambda names it (module, then export). */
export const NATIVE_HANDLER = `${
  KitSdk.Entry.BUNDLE.replace(/\.js$/, "")
}.${KitSdk.Entry.HANDLER}`;
const MODULE_MARKER = "package.json";

// A fixed timestamp (zip's own earliest), so the same bundle always adapts to
// the same bytes — the function pack kit zips the same way.
const REPRODUCIBLE_MTIME = new Date("1980-01-01T00:00:00Z");

const ADAPTER_SOURCE = Deno.readFileSync(
  new URL("./runtime/ensemble-lambda.mjs", import.meta.url),
);

/**
 * Makes a function bundle runnable by Lambda: adds the handler that adapts
 * API Gateway's events to the bundle's `main.js` (`./runtime/`), and marks its
 * modules as ES modules if the bundle doesn't already, Node telling them
 * apart by the nearest package.json. Done to every bundle the kit deploys,
 * packed or synced, so no bundle has to know about Lambda — except a native one
 * (an integration with a folder of its own), which already does: it exports
 * Lambda's `handler` itself, so it only gets the module marker.
 */
export class FunctionAdapter {
  /** `files` (paths in the bundle → contents) with the adapter in, or why they can't run here. */
  adaptFiles(files: Zippable): Zippable {
    if (this.isNative(files)) return this.marked(files);
    if (!(ENTRY in files)) {
      throw new Error(
        `The function's bundle has no ${ENTRY} at its root: a function.v1 bundle's ${ENTRY} default-exports { fetch(request, env) }.`,
      );
    }
    return this.marked({ ...files, [ADAPTER]: ADAPTER_SOURCE });
  }

  /** The `Handler` that runs `files`. */
  handlerOf(files: Zippable): string {
    return this.isNative(files) ? NATIVE_HANDLER : HANDLER;
  }

  private isNative(files: Zippable): boolean {
    return KitSdk.Entry.NATIVE in files;
  }

  private marked(files: Zippable): Zippable {
    if (MODULE_MARKER in files) return files;
    return {
      ...files,
      [MODULE_MARKER]: new TextEncoder().encode(`{ "type": "module" }\n`),
    };
  }

  /** A zipped bundle, adapted. */
  adapt(zip: Uint8Array): Uint8Array {
    return this.zip(this.adaptFiles(unzipSync(zip)));
  }

  /** The `Handler` that runs a zipped bundle. */
  handlerOfZip(zip: Uint8Array): string {
    return this.handlerOf(unzipSync(zip));
  }

  zip(files: Zippable): Uint8Array {
    return zipSync(files, { level: 9, mtime: REPRODUCIBLE_MTIME });
  }
}
