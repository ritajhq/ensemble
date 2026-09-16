import { green, red } from "@std/fmt/colors";
import { PlainPackReporter, type PackProgress, type PackReporter } from "@ensemble/core";
import { AnimatedProgressLine } from "./animated-progress-line.ts";

/**
 * The default `PackReporter` — `AnimatedBuildReporter`'s shape exactly, in
 * green instead of blue, marking a *pack*'s line rather than a build's:
 * "Packing", the spinner, and the name all green while running, resolving
 * into a ✓/✗ line with the name staying green. Delegates to
 * `PlainPackReporter` when stdout isn't a TTY, for the same reason
 * `AnimatedBuildReporter` does.
 */
export class AnimatedPackReporter implements PackReporter {
  private readonly fallback = new PlainPackReporter();

  packing(name: string): PackProgress {
    if (!Deno.stdout.isTerminal()) return this.fallback.packing(name);

    const label = green(`«${name}»`);
    const line = new AnimatedProgressLine((glyph) =>
      `${green(glyph)} ${green("Packing")} - ${label}`
    );

    return {
      succeed: () => line.resolve(`${green("✓")} Packed - ${label}`),
      fail: () => line.resolve(`${red("✗")} Failed - ${label}`),
    };
  }
}
