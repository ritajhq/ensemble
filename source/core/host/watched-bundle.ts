import { basename, dirname, fromFileUrl, join } from "@std/path";
import type { Spawned } from "./terminate-children-on-signal.ts";

/** How long a burst of edits (a formatter, a checkout) is let settle before building once for all of it. */
const SETTLE_DELAY_MS = 150;

/** How long one build may take before it's taken for stuck and stopped. */
const BUILD_TIMEOUT_MS = 120_000;

/** Windows' paths ignore case: compared as they're spelled, an edit can go unnoticed. */
const CASE_INSENSITIVE = Deno.build.os === "windows";

/** One module of `deno info --json`, as far as it is read here. */
interface InfoModule {
  readonly specifier: string;
  /** The file it was read from; absent when it couldn't be (a missing module). */
  readonly local?: string;
}

/**
 * A bundle kept up to date with its sources: built once, then again each time
 * a file of its entry's module graph changes.
 *
 * It stands in for `deno bundle --watch`, whose one long-lived process was
 * seen to wedge for good under `ens develop` (Deno 2.9.8: a thread blocked
 * reading its own socket) while still looking alive, so every later edit went
 * unbuilt without a word. Here each build is a fresh, one-shot `deno bundle`:
 * a stuck one costs that build alone, and is stopped after a while.
 *
 * Only the entry's own graph is watched, as `deno info` reports it after each
 * build, modules it imports but can't find included: an edit anywhere else in
 * the repository never rewrites this bundle (under `ens develop` a rewritten
 * bundle restarts whatever runs it), and creating a missing module builds
 * again.
 *
 * Paths are compared by where they really are (macOS reports `/private/var`
 * for `/var`) and, on Windows, regardless of case.
 *
 * Itself a `Spawned`, so `terminateChildrenOnSignal` stops it; awaiting it
 * resolves once it's stopped.
 */
export class WatchedBundle implements Spawned {
  private readonly stopped: Promise<{ code: number }>;
  private stop!: (result: { code: number }) => void;
  private ended = false;
  private building = false;
  private queued = false;
  private current?: Spawned;
  private pending?: ReturnType<typeof setTimeout>;
  private watcher?: Deno.FsWatcher;
  private watchedDirectories = "";
  private directories: string[] = [];
  /** The graph's files, each as `pathKey` spells it. */
  private files = new Set<string>();

  constructor(
    private readonly entry: string,
    /** Starts one build: `deno bundle` without `--watch`. */
    private readonly build: () => Spawned,
    private readonly denoExe: string,
    /** What `deno` needs to find the workspace: `--config <generated deno.json>`. */
    private readonly configArgs: readonly string[],
  ) {
    this.stopped = new Promise((resolve) => this.stop = resolve);
  }

  /** Builds now, then on every change to the entry's graph, until killed. */
  watch(): this {
    this.rebuild();
    return this;
  }

  /** Builds again: at once if idle, or right after the build under way. */
  rebuild(): void {
    if (this.ended) return;
    if (this.building) {
      this.queued = true;
      return;
    }
    void this.buildUntilCurrent();
  }

  kill(signo?: Deno.Signal): void {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.pending);
    this.watcher?.close();
    try {
      this.current?.kill(signo);
    } catch {
      // Already exited on its own — nothing to tear down.
    }
    this.stop({ code: 0 });
  }

  then<TResult1 = { code: number }, TResult2 = never>(
    onfulfilled?:
      | ((value: { code: number }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.stopped.then(onfulfilled, onrejected);
  }

  /** Builds, and again for as long as changes came in during the last build. */
  private async buildUntilCurrent(): Promise<void> {
    this.building = true;
    do {
      this.queued = false;
      await this.buildOnce();
      await this.follow();
    } while (this.queued && !this.ended);
    this.building = false;
  }

  private async buildOnce(): Promise<void> {
    const child = this.build();
    this.current = child;
    const timer = setTimeout(() => {
      console.error(
        `deno bundle ${this.entry} ran over ${
          BUILD_TIMEOUT_MS / 1000
        }s and was stopped; the next change builds it again.`,
      );
      try {
        child.kill();
      } catch {
        // Finished in the meantime.
      }
    }, BUILD_TIMEOUT_MS);
    await child;
    clearTimeout(timer);
    this.current = undefined;
  }

  /** Watches the files of the entry's graph as it now stands. */
  private async follow(): Promise<void> {
    if (this.ended) return;
    const graph = await this.graphFiles();
    if (graph) {
      const resolved = await Promise.all(
        [...graph].map(async (file) =>
          join(await this.realDirectory(dirname(file)), basename(file))
        ),
      );
      this.files = new Set(resolved.map((file) => this.pathKey(file)));
      this.directories = await this.existing(
        [...new Set(resolved.map((file) => dirname(file)))],
      );
    }

    const directories = this.directories;
    const key = [...directories].sort().join("\n");
    if (key === this.watchedDirectories) return;
    this.watchedDirectories = key;
    this.watcher?.close();
    this.watcher = Deno.watchFs(directories, { recursive: false });
    void this.listen(this.watcher);
  }

  private async listen(watcher: Deno.FsWatcher): Promise<void> {
    try {
      for await (const event of watcher) {
        if (event.kind === "access") continue;
        if (!event.paths.some((path) => this.files.has(this.pathKey(path)))) {
          continue;
        }
        clearTimeout(this.pending);
        this.pending = setTimeout(() => this.rebuild(), SETTLE_DELAY_MS);
      }
    } catch {
      // Closed: the graph moved to other directories, or the watch ended.
    }
  }

  /** Every local file of the entry's graph, missing ones included; none when `deno info` itself fails, so the last graph stays watched. */
  private async graphFiles(): Promise<Set<string> | undefined> {
    const { code, stdout } = await new Deno.Command(this.denoExe, {
      args: ["info", "--json", ...this.configArgs, this.entry],
      stdout: "piped",
      stderr: "null",
    }).output();
    if (code !== 0) return undefined;
    const { modules } = JSON.parse(new TextDecoder().decode(stdout)) as {
      modules: readonly InfoModule[];
    };
    return new Set(
      modules.flatMap((module) => {
        if (module.local) return [module.local];
        if (module.specifier.startsWith("file:")) {
          return [fromFileUrl(module.specifier)];
        }
        return [];
      }),
    );
  }

  /** Where `directory` really is, links followed; as given when it doesn't exist (yet). */
  private async realDirectory(directory: string): Promise<string> {
    return await Deno.realPath(directory).catch(() => directory);
  }

  private pathKey(path: string): string {
    return CASE_INSENSITIVE ? path.toLowerCase() : path;
  }

  private async existing(directories: string[]): Promise<string[]> {
    const found = await Promise.all(
      directories.map((directory) =>
        Deno.stat(directory).then((info) => info.isDirectory, () => false)
      ),
    );
    return directories.filter((_, i) => found[i]);
  }
}
