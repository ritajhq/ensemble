import type { BuildProgress, BuildReporter } from "./build-reporter.ts";

/**
 * The undecorated `BuildReporter` a future `--plain` flag would select — no
 * color, no animation, no in-place redraws: one line per state change, safe
 * for any output target (a TTY, a pipe, a CI log).
 */
export class PlainBuildReporter implements BuildReporter {
  building(name: string): BuildProgress {
    console.log(`Building - «${name}»`);
    return {
      succeed: () => console.log(`Built - «${name}»`),
      fail: () => console.log(`Failed - «${name}»`),
    };
  }
}
