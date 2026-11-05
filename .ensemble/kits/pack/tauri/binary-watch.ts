import type { Shell } from "./shell.ts";

/**
 * Keeps a Tauri app's executable current: builds it, then again each time its Rust sources change. A failed build leaves
 * the last good executable where it is and says why, so a running app is not pulled out from under the developer by a
 * typo.
 */
export class BinaryWatch {
  constructor(
    private readonly shell: Shell,
    private readonly output: string,
    private readonly quietMs = 500,
  ) {}

  /** Runs until the process is told to stop. */
  async run(): Promise<void> {
    await this.rebuild();
    const watcher = Deno.watchFs(this.shell.watched().filter((path) => this.exists(path)));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let building = Promise.resolve();
    let again = false;

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // A change during a build means the build is already out of date: build once more when it ends.
        if (again) return;
        again = true;
        building = building.then(async () => {
          again = false;
          await this.rebuild();
        });
      }, this.quietMs);
    };

    for await (const _ of watcher) schedule();
  }

  private async rebuild(): Promise<void> {
    const started = Date.now();
    try {
      const built = await this.shell.compile("debug");
      const replaced = await this.shell.publish(built, this.output);
      console.log(`tauri: ${replaced ? "binary updated" : "binary unchanged"} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    } catch (error) {
      console.error(`tauri: build failed, keeping the last binary. ${(error as Error).message}`);
    }
  }

  private exists(path: string): boolean {
    try {
      Deno.statSync(path);
      return true;
    } catch {
      return false;
    }
  }
}
