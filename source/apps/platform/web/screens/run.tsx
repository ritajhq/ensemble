import { useEffect, useRef, useState } from "react";
import { Badge } from "@ritaj/ui";
import type { Run } from "../api.ts";
import { useApi } from "../api-provider.tsx";
import { Notice } from "../components/notice.tsx";
import { Panel } from "../components/panel.tsx";
import { RunBadge } from "../components/run-badge.tsx";
import { projectHash } from "../places.ts";
import { detailsOf, titleOf } from "../run-title.ts";

/** One run: what was deployed where, how it went, and everything it printed, followed live while it runs. */
export function RunScreen({ id }: { id: string }) {
  const api = useApi();
  const [run, setRun] = useState<Run | undefined>();
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const events = new EventSource(api.runEvents(id));
    events.addEventListener("line", (event) => {
      const { index, line } = JSON.parse((event as MessageEvent).data);
      setLines((previous) => {
        const next = [...previous];
        next[index] = line;
        return next;
      });
    });
    events.addEventListener("state", (event) => {
      const state: Run = JSON.parse((event as MessageEvent).data);
      setRun(state);
      if (state.state === "succeeded" || state.state === "failed") {
        events.close();
        // Everything it printed, as kept: whatever the stream may have missed.
        api.run(id).then((kept) => setLines([...kept.lines])).catch(() => {});
      }
    });
    events.onerror = () => {
      if (events.readyState === EventSource.CLOSED) {
        setError("Lost the run's progress: reload to follow it again.");
      }
    };
    return () => events.close();
  }, [api, id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  if (!run) return error ? <Notice tone="error">{error}</Notice> : null;
  const { work } = run;

  return (
    <>
      <Panel
        title={titleOf(work)}
        description={
          <a className="underline" href={projectHash(work.project)}>
            {work.project}
          </a>
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-body">
          <RunBadge state={run.state} />
          {detailsOf(work).map((detail) => (
            <Badge key={detail} color="gray">{detail}</Badge>
          ))}
          {run.commit && (
            <span className="font-mono text-caption">
              {run.commit.slice(0, 12)}
            </span>
          )}
          <span className="text-muted-foreground">
            {new Date(run.startedAt ?? run.queuedAt).toLocaleString()}
          </span>
        </div>
        {run.error && <Notice tone="error">{run.error}</Notice>}
      </Panel>
      <section className="min-w-0 rounded-xl bg-surface-2 p-4 shadow-surface-2">
        <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-all font-mono text-caption">
          {lines.join("\n") || (run.state === "queued" ? "Waiting for the project's checkout…" : "")}
          <div ref={bottom} />
        </pre>
      </section>
    </>
  );
}
