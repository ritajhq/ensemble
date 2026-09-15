const FRAMES = ["◰", "◳", "◲", "◱"];
const FRAME_INTERVAL_MS = 120;
const ERASE_LINE = "\r\x1b[K";

/**
 * One line's in-flight progress, redrawn in place with a rotating square
 * until resolved into a final line — the shared mechanics behind every
 * animated `*Reporter` (build, pack, ...). Domain-agnostic on purpose: what
 * color, verb, or name it shows is entirely up to `renderSpinning`/`resolve`'s
 * caller, so a new reporter never has to re-derive timer/redraw handling.
 */
export class AnimatedProgressLine {
  private frame = 0;
  private readonly timer: number;

  constructor(private readonly renderSpinning: (glyph: string) => string) {
    this.draw();
    this.timer = setInterval(() => this.draw(), FRAME_INTERVAL_MS);
  }

  /** Stops the animation and replaces it in place with `line` — call exactly once. */
  resolve(line: string): void {
    clearInterval(this.timer);
    this.write(`${ERASE_LINE}${line}\n`);
  }

  private draw(): void {
    this.write(`${ERASE_LINE}${this.renderSpinning(FRAMES[this.frame])}`);
    this.frame = (this.frame + 1) % FRAMES.length;
  }

  private write(text: string): void {
    Deno.stdout.writeSync(new TextEncoder().encode(text));
  }
}
