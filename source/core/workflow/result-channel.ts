/**
 * A `script:` step's result (its JSON outputs) can't share stdout with the
 * step's own `console.log` calls — the two would collide. A ResultChannel is
 * a swappable mechanism for getting that JSON result back from the
 * subprocess out-of-band, leaving stdout/stderr free for the script's own
 * output. The bootstrap (run-script-subprocess.ts) is handed a `handle`
 * string (currently a temp file path) as its second CLI argument and writes
 * its JSON result there instead of to stdout.
 */
export interface ResultChannel {
  /** Prepares the channel for one step run, returning a handle to pass to the subprocess. */
  create(): Promise<string>;
  /** Reads back whatever the subprocess wrote to `handle`, or "" if nothing was written. */
  read(handle: string): Promise<string>;
  /** Releases any resources associated with `handle`. */
  cleanup(handle: string): Promise<void>;
}

/** Default ResultChannel: a plain temp file, one per step run. */
export class TempFileResultChannel implements ResultChannel {
  async create(): Promise<string> {
    return await Deno.makeTempFile();
  }

  async read(handle: string): Promise<string> {
    try {
      return await Deno.readTextFile(handle);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return "";
      throw error;
    }
  }

  async cleanup(handle: string): Promise<void> {
    await Deno.remove(handle).catch(() => {});
  }
}
