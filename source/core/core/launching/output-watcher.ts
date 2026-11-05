import { dirname, resolve } from "@std/path";

/** Tells when something on disk changed, once per burst of changes. */
export class OutputWatcher {
  private readonly watcher: Deno.FsWatcher;
  private readonly onlyFile?: string;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;

  /**
   * `path` may be a folder or a file; `onChange` runs `quietMs` after the last change in a burst. A file is watched
   * through its folder, because a file replaced by a rename gets a new identity and a watch on the old one goes quiet.
   */
  constructor(
    path: string,
    private readonly onChange: () => void,
    private readonly quietMs = 400,
  ) {
    const target = resolve(path);
    this.onlyFile = Deno.statSync(target).isFile ? target : undefined;
    this.watcher = Deno.watchFs(this.onlyFile ? dirname(target) : target);
    void this.pump();
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.timer);
    this.watcher.close();
  }

  private async pump(): Promise<void> {
    try {
      for await (const event of this.watcher) {
        if (this.concerns(event)) this.settle();
      }
    } catch {
      // Closed while waiting.
    }
  }

  private concerns(event: Deno.FsEvent): boolean {
    if (!this.onlyFile) return true;
    return event.paths.some((path) => resolve(path) === this.onlyFile);
  }

  private settle(): void {
    if (this.closed) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.onChange(), this.quietMs);
  }
}
