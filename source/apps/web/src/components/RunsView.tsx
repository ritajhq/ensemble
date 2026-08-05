import { type ReactNode, useEffect, useState } from "react";
import { useParams } from "react-router";
import { fetchRuns, fetchWorkflows, type RunRecord, type WorkflowTriggerSummary } from "../lib/api.ts";
import { decodeWorkflowId } from "../lib/workflow-id.ts";
import { formatDuration, formatRelativeTime, statusVariant } from "../lib/status.ts";
import { TriggerRunSheet } from "./TriggerRunSheet.tsx";
import {
  Badge,
  Card,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@ritaj/ui";

/** "manual" / "github" / etc, or "—" when a run predates trigger tracking. */
function triggerLabel(run: RunRecord): string {
  const type = run.trigger?.type;
  return typeof type === "string" ? type : "—";
}

const ACTIVE_RUN_FIELDS: {
  label: string;
  render: (run: RunRecord) => ReactNode;
}[] = [
  { label: "Run ID", render: (run) => <span className="font-mono">{run.runId.slice(0, 8)}</span> },
  { label: "Started", render: (run) => formatRelativeTime(run.startedAt) },
  { label: "Duration", render: (run) => formatDuration(run.startedAt, run.finishedAt) },
  { label: "Trigger", render: (run) => triggerLabel(run) },
];

function ActiveRunCard(
  { workflowId, triggers, run, onRun }: {
    workflowId: string;
    triggers: WorkflowTriggerSummary[];
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
            <TriggerRunSheet key={index} workflowId={workflowId} trigger={trigger} onTriggered={onRun} />
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

function RunHistoryRow({ run }: { run: RunRecord }) {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3 text-sm last:border-0">
      <Badge variant="secondary" className="font-mono">{run.runId.slice(0, 8)}</Badge>
      <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
      <span className="text-muted-foreground">{triggerLabel(run)}</span>
      <div className="flex flex-1 flex-wrap justify-end gap-1">
        {Object.entries(run.jobs).map(([jobId, status]) => (
          <Badge key={jobId} variant={statusVariant(status)}>
            {jobId}: {status}
          </Badge>
        ))}
      </div>
      <span className="w-32 shrink-0 text-right text-muted-foreground" title={new Date(run.startedAt).toLocaleString()}>
        {formatRelativeTime(run.startedAt)}
      </span>
    </div>
  );
}

function RunHistory({ runs }: { runs: RunRecord[] }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-medium">Run history</h2>
      <p className="mb-3 text-sm text-muted-foreground">Every past run for this workflow.</p>
      <Card className="gap-0 py-0">
        {runs.length === 0
          ? <p className="px-4 py-3 text-sm text-muted-foreground">No runs yet.</p>
          : runs.map((run) => <RunHistoryRow key={run.runId} run={run} />)}
      </Card>
    </div>
  );
}

export function RunsView() {
  const { workflowId = "" } = useParams();
  const workflowName = workflowId ? decodeWorkflowId(workflowId) : "";
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [triggers, setTriggers] = useState<WorkflowTriggerSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refetchRuns() {
    fetchRuns(workflowId).then(setRuns).catch((e) => setError(e.message));
  }

  useEffect(() => {
    setRuns(null);
    setError(null);
    refetchRuns();
    fetchWorkflows()
      .then((workflows) => setTriggers(workflows.find((w) => w.id === workflowId)?.triggers ?? []))
      .catch(() => {});
  }, [workflowId]);

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-4xl flex-col">
        <h1 className="px-6 pt-6 text-lg font-medium">{workflowName}</h1>

        <Tabs defaultValue="runs" className="px-6 pt-4">
          <TabsList>
            <TabsTab value="runs">Runs</TabsTab>
          </TabsList>
          <TabsPanel value="runs" className="flex flex-col gap-6 py-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!error && !runs && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!error && runs && (
              <>
                <ActiveRunCard
                  workflowId={workflowId}
                  triggers={triggers}
                  run={runs[0] ?? null}
                  onRun={refetchRuns}
                />
                <RunHistory runs={runs} />
              </>
            )}
          </TabsPanel>
        </Tabs>
      </div>
    </div>
  );
}
