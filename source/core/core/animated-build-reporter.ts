import { blue, green, red } from "@std/fmt/colors";
import type { BuildProgress, BuildReporter } from "./build-reporter.ts";
import { PlainBuildReporter } from "./plain-build-reporter.ts";
import { AnimatedProgressLine } from "./animated-progress-line.ts";

/**
 * The default `BuildReporter`: a rotating blue square next to "Building" —
 * also blue, as is the app name — a dash, then «guillemets», redrawn in
 * place on one line until the build resolves into a ✓/✗ line of the same
 * shape (the name staying blue throughout, marking the whole line as a
 * *build*'s — pack's own reporter uses green the same way). Delegates to
 * `PlainBuildReporter` when stdout isn't a TTY (a pipe, a log file, CI) —
 * `\r`-based redraws (and color codes, which `@std/fmt/colors` emits
 * regardless of TTY status) only belong on a real terminal.
 */
export class AnimatedBuildReporter implements BuildReporter {
  private readonly fallback = new PlainBuildReporter();

  building(name: string): BuildProgress {
    if (!Deno.stdout.isTerminal()) return this.fallback.building(name);

    const label = blue(`«${name}»`);
    const line = new AnimatedProgressLine((glyph) =>
      `${blue(glyph)} ${blue("Building")} - ${label}`
    );

    return {
      succeed: () => line.resolve(`${green("✓")} Built - ${label}`),
      fail: () => line.resolve(`${red("✗")} Failed - ${label}`),
    };
  }
}
