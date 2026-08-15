import { type ReactNode, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  deleteRun,
  fetchRuns,
  fetchWorkflows,
  type RunRecord,
  type WorkflowTriggerSummary,
} from "../lib/api.ts";
import { formatDuration, statusVariant, useRelativeTime } from "../lib/status.ts";
import { TriggerRunSheet } from "./TriggerRunSheet.tsx";
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
import { Trash2 } from "lucide-react";

/** "manual" / "github" / etc, or "—" when a run predates trigger tracking. */
function triggerLabel(run: RunRecord): string {
  const type = run.trigger?.type;
  return typeof type === "string" ? type : "—";
}

function StartedAt({ startedAt }: { startedAt: string }) {
  const relative = useRelativeTime(startedAt);
  return <span title={new Date(startedAt).toLocaleString()}>{relative}</span>;
}

const ACTIVE_RUN_FIELDS: {
  label: string;
  render: (run: RunRecord) => ReactNode;
}[] = [
  { label: "Run ID", render: (run) => <span className="font-mono">{run.runId.slice(0, 8)}</span> },
  { label: "Started", render: (run) => <StartedAt startedAt={run.startedAt} /> },
  { label: "Duration", render: (run) => formatDuration(run.startedAt, run.finishedAt) },
  { label: "Trigger", render: (run) => triggerLabel(run) },
];

function ActiveRunCard(
  { workflowId, triggers, contexts, run, onRun }: {
    workflowId: string;
    triggers: WorkflowTriggerSummary[];
    contexts: string[];
    run: RunRecord | null;
    onRun: () => void;
  },
) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <span className="text-sm font-medium">Active run</span>
        <div className="flex items-center gap-2">
          {triggers.map((trigger, index) => (
            <TriggerRunSheet
              key={index}
              workflowId={workflowId}
              trigger={trigger}
              contexts={contexts}
              onTriggered={onRun}
            />
          ))}
        </div>
      </div>

      <div className="px-4 py-3">
        {!run && <p className="text-sm text-muted-foreground">No runs yet.</p>}
        {run && (
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {ACTIVE_RUN_FIELDS.map(({ label, render }) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-sm">{render(run)}</span>
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Status</span>
              <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function DeleteRunDialog(
  { workflowId, runId, onDeleted }: { workflowId: string; runId: string; onDeleted: () => void },
) {
  const [deleting, setDeleting] = useState(false);

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={(event: React.MouseEvent) => event.stopPropagation()}
          />
        }
      >
        <Trash2 className="size-3.5" />
        <span className="sr-only">Delete run</span>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(event) => event.stopPropagation()}>
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

function RunHistoryRow(
  { workflowId, run, onDeleted }: { workflowId: string; run: RunRecord; onDeleted: () => void },
) {
  const navigate = useNavigate();
  const startedRelative = useRelativeTime(run.startedAt);

  return (
    <div
      className="flex cursor-pointer items-center gap-3 border-b px-4 py-3 text-sm last:border-0 hover:bg-accent/50"
      onClick={() => navigate(`/workflows/${workflowId}/runs/${run.runId}`)}
    >
      <Badge variant="secondary" className="font-mono">{run.runId.slice(0, 8)}</Badge>
      <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
      <span className="flex-1 text-muted-foreground">{triggerLabel(run)}</span>
      <span className="shrink-0 text-muted-foreground" title={new Date(run.startedAt).toLocaleString()}>
        {startedRelative}
      </span>
      <DeleteRunDialog workflowId={workflowId} runId={run.runId} onDeleted={onDeleted} />
    </div>
  );
}

function RunHistory(
  { workflowId, runs, onDeleted }: { workflowId: string; runs: RunRecord[]; onDeleted: () => void },
) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-medium">Run history</h2>
      <p className="mb-3 text-sm text-muted-foreground">Every past run for this workflow.</p>
      <Card className="gap-0 py-0">
        {runs.length === 0
          ? <p className="px-4 py-3 text-sm text-muted-foreground">No runs yet.</p>
          : runs.map((run) => (
            <RunHistoryRow key={run.runId} workflowId={workflowId} run={run} onDeleted={onDeleted} />
          ))}
      </Card>
    </div>
  );
}

export function RunsView() {
  const { workflowId = "" } = useParams();
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [triggers, setTriggers] = useState<WorkflowTriggerSummary[]>([]);
  const [contexts, setContexts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refetchRuns() {
    fetchRuns(workflowId).then(setRuns).catch((e) => setError(e.message));
  }

  useEffect(() => {
    setRuns(null);
    setError(null);
    refetchRuns();
    fetchWorkflows()
      .then((workflows) => {
        const workflow = workflows.find((w) => w.id === workflowId);
        setTriggers(workflow?.triggers ?? []);
        setContexts(workflow?.contexts ?? []);
      })
      .catch(() => {});
  }, [workflowId]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && !runs && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!error && runs && (
        <>
          <ActiveRunCard
            workflowId={workflowId}
            triggers={triggers}
            contexts={contexts}
            run={runs[0] ?? null}
            onRun={refetchRuns}
          />
          <RunHistory workflowId={workflowId} runs={runs} onDeleted={refetchRuns} />
        </>
      )}
    </div>
  );
}
