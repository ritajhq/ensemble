import { type ReactNode, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  deleteRun,
  fetchRunSteps,
  fetchRuns,
  openRunEvents,
  type RunJobNode,
  type RunRecord,
  type StepRecord,
} from "../lib/api.ts";
import { formatDuration, formatRelativeTime, statusVariant } from "../lib/status.ts";
import { JobFlowDiagram } from "./JobFlowDiagram.tsx";
import { StepLogSheet } from "./StepLogSheet.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  Card,
} from "@ritaj/ui";
import { ArrowLeft, Trash2 } from "lucide-react";

/** "manual" / "github" / etc, or "—" when a run predates trigger tracking. */
function triggerLabel(run: RunRecord): string {
  const type = run.trigger?.type;
  return typeof type === "string" ? type : "—";
}

const RUN_DETAIL_FIELDS: {
  label: string;
  render: (run: RunRecord) => ReactNode;
}[] = [
  { label: "Run ID", render: (run) => <span className="font-mono">{run.runId.slice(0, 8)}</span> },
  { label: "Started", render: (run) => formatRelativeTime(run.startedAt) },
  { label: "Duration", render: (run) => formatDuration(run.startedAt, run.finishedAt) },
  { label: "Trigger", render: (run) => triggerLabel(run) },
];

function DeleteRunButton({ workflowId, runId, onDeleted }: { workflowId: string; runId: string; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" />}
      >
        <Trash2 className="size-3.5" />
        <span className="sr-only">Delete run</span>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this run?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the run and its step logs. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              try {
                await deleteRun(workflowId, runId);
                onDeleted();
              } finally {
                setDeleting(false);
              }
            }}
          >
            {deleting ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RunHeader(
  { run, workflowId, onDeleted }: { run: RunRecord; workflowId: string; onDeleted: () => void },
) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <span className="text-sm font-medium">Run details</span>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
          <DeleteRunButton workflowId={workflowId} runId={run.runId} onDeleted={onDeleted} />
        </div>
      </div>
      <div className="px-4 py-3">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {RUN_DETAIL_FIELDS.map(({ label, render }) => (
            <div key={label} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-sm">{render(run)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function RunDetailView() {
  const { workflowId = "", runId = "" } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState<RunRecord | null | undefined>(undefined);
  const [jobs, setJobs] = useState<RunJobNode[]>([]);
  const [steps, setSteps] = useState<StepRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  useEffect(() => {
    setRun(undefined);
    setError(null);

    fetchRuns(workflowId)
      .then((runs) => setRun(runs.find((r) => r.runId === runId) ?? null))
      .catch((e) => setError(e.message));

    fetchRunSteps(workflowId, runId)
      .then(({ steps, jobs }) => {
        setSteps(steps);
        setJobs(jobs);
      })
      .catch((e) => setError(e.message));
  }, [workflowId, runId]);

  useEffect(() => {
    if (!workflowId || !runId) return;

    return openRunEvents(workflowId, runId, (updated) => {
      setRun(updated);
      if (updated.steps) setSteps(updated.steps);
    });
  }, [workflowId, runId]);

  const selectedJobSteps = selectedJobId ? steps.filter((step) => step.jobId === selectedJobId) : [];

  return (
    <>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-6">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted-foreground hover:text-foreground"
            onClick={() => navigate(`/workflows/${workflowId}/runs`)}
          >
            <ArrowLeft className="size-3.5" />
            Back to all runs
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && run === undefined && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!error && run === null && <p className="text-sm text-muted-foreground">Run not found.</p>}
        {!error && run && (
          <>
            <RunHeader
              run={run}
              workflowId={workflowId}
              onDeleted={() => navigate(`/workflows/${workflowId}/runs`)}
            />

            <div>
              <h2 className="mb-3 text-sm font-medium">Jobs</h2>
              {jobs.length === 0
                ? <p className="text-sm text-muted-foreground">No jobs declared.</p>
                : (
                  <JobFlowDiagram
                    jobs={jobs}
                    jobStatuses={run.jobs}
                    onSelectJob={setSelectedJobId}
                  />
                )}
            </div>
          </>
        )}
      </div>

      <StepLogSheet
        workflowId={workflowId}
        runId={runId}
        jobId={selectedJobId}
        steps={selectedJobSteps}
        onOpenChange={(open) => {
          if (!open) setSelectedJobId(null);
        }}
      />
    </>
  );
}
