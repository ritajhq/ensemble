import type { Emitter } from "@duesabati/evento";
import type * as Platform from "@ensemble/platform";
import type * as Kv from "./kv.ts";

/** A run as the API shows it. */
export class RunView {
  static of(run: Platform.Run) {
    return {
      id: run.id,
      state: run.state,
      queuedAt: run.queuedAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      commit: run.commit,
      error: run.error,
      work: { ...run.work },
    };
  }
}

/** Where a run's progress is heard from as it happens. */
export interface RunEvents {
  readonly OnPrinted: Emitter<[Platform.Run, number, string]>;
  readonly OnStarted: Emitter<[Platform.Run]>;
  readonly OnFinished: Emitter<[Platform.Run]>;
}

const FINISHED: ReadonlySet<Platform.RunState> = new Set([
  "succeeded",
  "failed",
]);

/**
 * One run's output as server-sent events, for a page to follow: every line
 * printed so far, then each new one as it's printed, and a `state` event
 * whenever the run moves on. The stream ends once the run has finished.
 */
export class RunFeed {
  constructor(
    private readonly runs: Kv.Runs,
    private readonly events: RunEvents,
  ) {}

  async follow(id: string): Promise<Response | undefined> {
    const run = await this.runs.get(id);
    if (!run) return undefined;

    const encoder = new TextEncoder();
    const subscriptions: { Dispose(): void }[] = [];
    let closed = false;
    const body = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        const send = (event: string, data: unknown) => {
          if (closed) return;
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        };
        const close = () => {
          if (closed) return;
          closed = true;
          for (const subscription of subscriptions) subscription.Dispose();
          controller.close();
        };

        // Heard before the backlog is read, so a line printed meanwhile is
        // held rather than lost, and sent once the backlog is out.
        const held: [number, string][] = [];
        let sent = -1;
        const sendLine = (index: number, line: string) => {
          if (index <= sent) return;
          send("line", { index, line });
          sent = index;
        };
        let backlogOut = false;
        subscriptions.push(
          this.events.OnPrinted.Do((printed, index, line) => {
            if (printed.id !== id) return;
            if (backlogOut) sendLine(index, line);
            else held.push([index, line]);
          }),
          this.events.OnStarted.Do((started) => {
            if (started.id === id) send("state", RunView.of(started));
          }),
          this.events.OnFinished.Do((finished) => {
            if (finished.id !== id) return;
            send("state", RunView.of(finished));
            close();
          }),
        );

        (await this.runs.lines(id)).forEach((line, index) =>
          sendLine(index, line)
        );
        for (const [index, line] of held) sendLine(index, line);
        backlogOut = true;

        const current = (await this.runs.get(id)) ?? run;
        send("state", RunView.of(current));
        if (FINISHED.has(current.state)) close();
      },
      cancel: () => {
        closed = true;
        for (const subscription of subscriptions) subscription.Dispose();
      },
    });

    return new Response(body, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
      },
    });
  }
}
