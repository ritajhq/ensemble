import { Deploy as CoreDeploy } from "@ensemble/core";
import {
  DEPLOY_KIT_WRAPPER_SOURCE,
  RESPONSE_MARKER,
} from "./deploy-kit-rpc-wrapper.ts";

interface Response {
  readonly id: number;
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: string;
}

interface Pending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

/** The part of a process's stderr kept to explain it exiting early. */
const STDERR_TAIL_BYTES = 8192;

/**
 * One long-lived `deno run` process serving every call into one vendored
 * deploy kit (see `deploy-kit-rpc-wrapper.ts` for its side of the protocol),
 * started on the first call. A render makes dozens of calls; starting a
 * process for each cost ~250ms apiece.
 *
 * The process never keeps `ens` alive on its own: it is unref'd whenever no
 * call is waiting on it, so a command that is done exits without having to
 * close it — which also closes the process's stdin, and it exits. `close()`
 * does the same, sooner. A call made after the process has died fails with
 * why it died, and so does every call still waiting on it.
 */
export class KitHost {
  private process: Promise<Deno.ChildProcess> | undefined;
  private writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
  private wrapperPath: string | undefined;
  private readonly pending = new Map<number, Pending>();
  private nextId = 0;
  private died: Error | undefined;
  private stderrTail = "";
  private stderrRead: Promise<void> = Promise.resolve();

  constructor(
    private readonly vendoredDir: string,
    private readonly denoExe: string,
  ) {}

  async call(
    target: string,
    method: string,
    args: unknown[],
  ): Promise<unknown> {
    const child = await this.started();
    if (this.died) throw this.died;

    const id = this.nextId++;
    const answered = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    child.ref();
    try {
      await this.writer!.write(
        new TextEncoder().encode(
          JSON.stringify({ id, target, method, args }) + "\n",
        ),
      );
    } catch (error) {
      // The process went away before it could be asked.
      this.pending.delete(id);
      throw this.died ?? error;
    }
    try {
      return await answered;
    } finally {
      if (this.pending.size === 0) child.unref();
    }
  }

  /** Ends the process: it exits once it has answered what it was asked. */
  async close(): Promise<void> {
    if (!this.process) return;
    const child = await this.process;
    child.ref();
    await this.writer?.close().catch(() => {});
    await child.status;
  }

  private started(): Promise<Deno.ChildProcess> {
    this.process ??= this.start();
    return this.process;
  }

  private async start(): Promise<Deno.ChildProcess> {
    this.wrapperPath = await Deno.makeTempFile({
      dir: this.vendoredDir,
      suffix: ".ts",
    });
    await Deno.writeTextFile(this.wrapperPath, DEPLOY_KIT_WRAPPER_SOURCE);

    const child = new Deno.Command(this.denoExe, {
      args: [
        "run",
        "-A",
        "-q",
        "--minimum-dependency-age",
        "0",
        this.wrapperPath,
      ],
      cwd: this.vendoredDir,
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    child.unref();
    this.writer = child.stdin.getWriter();

    this.readAnswers(child.stdout);
    this.stderrRead = this.readStderr(child.stderr);
    child.status.then((status) => this.exited(status.code));
    return child;
  }

  private async readAnswers(
    stdout: ReadableStream<Uint8Array<ArrayBuffer>>,
  ): Promise<void> {
    let buffered = "";
    for await (const chunk of stdout.pipeThrough(new TextDecoderStream())) {
      buffered += chunk;
      let newline = buffered.indexOf("\n");
      while (newline !== -1) {
        this.receive(buffered.slice(0, newline));
        buffered = buffered.slice(newline + 1);
        newline = buffered.indexOf("\n");
      }
    }
  }

  /** An answer, or something the kit printed itself — which is passed through, as it would have been before. */
  private receive(line: string): void {
    if (!line.startsWith(RESPONSE_MARKER)) {
      if (line.length > 0) console.error(line);
      return;
    }
    // Answering at all means the wrapper has imported the kit, so its file
    // has served its purpose: removed now, it can't be left behind by an
    // `ens` that exits without closing this.
    this.removeWrapper();

    const response: Response = JSON.parse(line.slice(RESPONSE_MARKER.length));
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);

    if (!response.ok) {
      pending.reject(new CoreDeploy.KitLoadError(response.error ?? ""));
      return;
    }
    // The wrapper's own JSON.stringify(result ?? null) collapses `undefined`
    // to `null` on the wire (JSON has no `undefined`) — safe to normalize
    // back here since none of Kit/Realization/Provisioner's return types
    // ever legitimately use `null` as a distinct value from `undefined`.
    pending.resolve(response.result === null ? undefined : response.result);
  }

  private async readStderr(
    stderr: ReadableStream<Uint8Array<ArrayBuffer>>,
  ): Promise<void> {
    for await (const chunk of stderr.pipeThrough(new TextDecoderStream())) {
      this.stderrTail = (this.stderrTail + chunk).slice(-STDERR_TAIL_BYTES);
    }
  }

  private removeWrapper(): void {
    if (!this.wrapperPath) return;
    Deno.remove(this.wrapperPath).catch(() => {});
    this.wrapperPath = undefined;
  }

  private async exited(code: number): Promise<void> {
    this.removeWrapper();
    await this.stderrRead;
    this.died = new CoreDeploy.KitLoadError(
      this.stderrTail.trim() || `The kit's process exited with code ${code}.`,
    );
    for (const pending of this.pending.values()) pending.reject(this.died);
    this.pending.clear();
  }
}
