import type { PackProgress, PackReporter } from "./pack-reporter.ts";

/**
 * The undecorated `PackReporter` a future `--plain` flag would select — no
 * color, no animation, no in-place redraws: one line per state change, safe
 * for any output target (a TTY, a pipe, a CI log).
 */
export class PlainPackReporter implements PackReporter {
  packing(name: string): PackProgress {
    console.log(`Packing - «${name}»`);
    return {
      succeed: () => console.log(`Packed - «${name}»`),
      fail: () => console.log(`Failed - «${name}»`),
    };
  }
}
