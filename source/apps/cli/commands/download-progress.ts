const BAR_WIDTH = 30;
const MEBIBYTE = 1024 * 1024;

/**
 * Renders a single-line, in-place progress bar on stderr for a byte download.
 * On a non-TTY stderr (CI logs, pipes) it stays silent apart from a start
 * and finish line, so logs aren't flooded with carriage-return frames.
 */
export class DownloadProgress {
  private readonly encoder = new TextEncoder();
  private readonly interactive = Deno.stderr.isTerminal();
  private readonly startedAt = performance.now();
  private lastFrame = "";

  constructor(private readonly label: string) {}

  Begin(total: number | undefined): void {
    if (this.interactive) return;
    this.write(`${this.label}${total ? ` (${this.megabytes(total)})` : ""}...\n`);
  }

  Advance(received: number, total: number | undefined): void {
    if (!this.interactive) return;
    const frame = total ? this.boundedFrame(received, total) : this.unboundedFrame(received);
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    this.write(`\r\x1b[2K${frame}`);
  }

  Finish(): void {
    if (this.interactive) {
      this.write("\r\x1b[2K");
      return;
    }
    this.write(`${this.label}: done in ${this.elapsedSeconds()}s\n`);
  }

  private boundedFrame(received: number, total: number): string {
    const ratio = Math.min(received / total, 1);
    const filled = Math.round(ratio * BAR_WIDTH);
    const bar = "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
    const percent = String(Math.floor(ratio * 100)).padStart(3);
    return `${this.label} ${bar} ${percent}% ${this.megabytes(received)}/${this.megabytes(total)} ${this.speed(received)}`;
  }

  private unboundedFrame(received: number): string {
    return `${this.label} ${this.megabytes(received)} ${this.speed(received)}`;
  }

  private speed(received: number): string {
    const seconds = Math.max((performance.now() - this.startedAt) / 1000, 0.001);
    return `${(received / MEBIBYTE / seconds).toFixed(1)} MB/s`;
  }

  private megabytes(bytes: number): string {
    return `${(bytes / MEBIBYTE).toFixed(1)} MB`;
  }

  private elapsedSeconds(): string {
    return ((performance.now() - this.startedAt) / 1000).toFixed(1);
  }

  private write(text: string): void {
    Deno.stderr.writeSync(this.encoder.encode(text));
  }
}
