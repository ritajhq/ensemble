import { useEffect, useState } from "react";
import { fetchStepLog, type StepLog, type StepRecord } from "../lib/api.ts";
import { formatDuration, statusDotColor } from "../lib/status.ts";
import { StepLogViewer } from "./StepLogViewer.tsx";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@ritaj/ui";

function StepEntry(
  { workflowId, runId, step, expanded, onToggle, isFirst, isLast }: {
    workflowId: string;
    runId: string;
    step: StepRecord;
    expanded: boolean;
    onToggle: () => void;
    isFirst: boolean;
    isLast: boolean;
  },
) {
  const [log, setLog] = useState<StepLog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded || log !== null) return;
    fetchStepLog(workflowId, runId, step.jobId, step.index)
      .then(setLog)
      .catch((e) => setError(e.message));
  }, [expanded]);

  return (
    <div className="border-b last:border-0">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-accent/50"
        onClick={onToggle}
      >
        <span className="relative flex w-3 shrink-0 flex-col items-center self-stretch">
          <span className={`-mt-2.5 w-px flex-1 ${isFirst ? "bg-transparent" : "bg-border"}`} />
          <span className={`size-2.5 shrink-0 rounded-full border-2 ${statusDotColor(step.status)}`} />
          <span className={`-mb-2.5 w-px flex-1 ${isLast ? "bg-transparent" : "bg-border"}`} />
        </span>
        <span className="flex-1 truncate">{step.label}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatDuration(step.startedAt, step.finishedAt)}
        </span>
      </button>
      {expanded && (
        <div className="h-80 border-t">
          <StepLogViewer jobId={step.jobId} label={step.label} log={log} error={error} />
        </div>
      )}
    </div>
  );
}

export function StepLogSheet(
  { workflowId, runId, jobId, steps, onOpenChange }: {
    workflowId: string;
    runId: string;
    jobId: string | null;
    steps: StepRecord[];
    onOpenChange: (open: boolean) => void;
  },
) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  useEffect(() => {
    setExpandedIndex(steps.length > 0 ? 0 : null);
  }, [jobId]);

  return (
    <Sheet open={jobId !== null} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full gap-0 p-0"
        resizable
        defaultWidth={640}
        minWidth={420}
        maxWidth={1100}
      >
        <SheetHeader className="border-b">
          <SheetTitle className="font-mono">{jobId}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-auto">
          {steps.length === 0
            ? <p className="p-4 text-sm text-muted-foreground">No steps recorded for this job.</p>
            : steps.map((step, index) => (
              <StepEntry
                key={`${step.jobId}-${step.index}`}
                workflowId={workflowId}
                runId={runId}
                step={step}
                expanded={expandedIndex === step.index}
                onToggle={() => setExpandedIndex((current) => current === step.index ? null : step.index)}
                isFirst={index === 0}
                isLast={index === steps.length - 1}
              />
            ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
