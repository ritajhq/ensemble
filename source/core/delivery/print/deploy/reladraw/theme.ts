/** A pair of fill and border. */
interface Tint {
  readonly fill: string;
  readonly border: string;
}

/**
 * The colors a drawing is dressed in: the compute colors, the network tints
 * and the external's, all written out in full so they stay what they are on
 * any base theme, and chosen to read on the page of that theme (reladraw
 * supplies everything else: the page, the text, the boxes' fills). There is
 * one for a dark page and one for a light page.
 */
export class Theme {
  static readonly dark = new Theme(
    "dark",
    "dark",
    "",
    [
      "#e06c75",
      "#61afef",
      "#98c379",
      "#e5c07b",
      "#c678dd",
      "#56b6c2",
      "#d19a66",
      "#f78fb3",
    ],
    [
      { fill: "#2b1d0e", border: "#d2904e" },
      { fill: "#0f2a2a", border: "#4aa3a3" },
      { fill: "#20172e", border: "#9a7bc4" },
      { fill: "#2b1420", border: "#c46a8a" },
    ],
  );

  static readonly light = new Theme(
    "light",
    "light",
    "-light",
    [
      "#d1495b",
      "#2a7ab9",
      "#4a8f3c",
      "#b8860b",
      "#8e44ad",
      "#1f8a99",
      "#c26a1d",
      "#c2467d",
    ],
    [
      { fill: "#fbeedd", border: "#c2802f" },
      { fill: "#e3f3f2", border: "#2f8f8f" },
      { fill: "#efe8f7", border: "#7d5ca8" },
      { fill: "#f9e6ee", border: "#b04a72" },
    ],
  );

  private constructor(
    readonly name: string,
    /** The reladraw theme that supplies what this one doesn't write out. */
    readonly base: string,
    /** What its drawing's file name ends with, before the extension. */
    readonly suffix: string,
    private readonly computes: readonly string[],
    private readonly networks: readonly Tint[],
  ) {}

  /** How many colors computes take before they repeat; each is a style, `compute_<n>`. */
  get computeColors(): number {
    return this.computes.length;
  }

  /** How many tints networks take before they repeat; each is a style, `network_<n>`. */
  get networkTints(): number {
    return this.networks.length;
  }

  /** The `style` statements that dress a drawing, for `computes` colors of computes in use. */
  styles(usedComputeColors: readonly number[]): string[] {
    return [
      `style external  fill: ${this.networks[0].fill}  border: ${
        this.networks[0].border
      }`,
      "style muted  text: (color: theme-muted)",
      ...this.networks.map((tint, index) =>
        `style network_${index}  fill: ${tint.fill}  border: ${tint.border}`
      ),
      ...usedComputeColors.map((index) =>
        `style compute_${index}  border: ${this.computes[index]}  line: ${
          this.computes[index]
        }`
      ),
    ];
  }
}
