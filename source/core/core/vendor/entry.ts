/** One vendored checkout's lockfile row — a pinned external repo checked out at `path`, whether it arrived inbound (`ens kit install`) or outbound (a future `ens lib eject`). */
export interface Entry {
  readonly repo: string;
  readonly ref: string;
  readonly path: string;
}
