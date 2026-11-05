/** Tells when something on disk changed, once per burst of changes. */
export class OutputWatcher {
  private readonly watcher: Deno.FsWatcher;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;

  /** `path` may be a folder or a file; `onChange` runs `quietMs` after the last change in a burst. */
  constructor(
    path: string,
    private readonly onChange: () => void,
    private readonly quietMs = 400,
  ) {
    this.watcher = Deno.watchFs(path);
    void this.pump();
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.timer);
    this.watcher.close();
  }

  private async pump(): Promise<void> {
    try {
      for await (const _ of this.watcher) this.settle();
    } catch {
      // Closed while waiting.
    }
  }

  private settle(): void {
    if (this.closed) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.onChange(), this.quietMs);
  }
}
