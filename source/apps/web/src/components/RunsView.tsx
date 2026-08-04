import { useEffect, useState } from "react";
import { useParams } from "react-router";
import {
  fetchRuns,
  fetchRunSteps,
  fetchStepLog,
  fetchWorkflowFileContent,
  fetchWorkflowFiles,
  runWorkflow,
  type RunRecord,
  type StepLog,
  type StepRecord,
  type WorkflowFileNode,
} from "../lib/api.ts";
import { decodeWorkflowId } from "../lib/workflow-id.ts";
import { formatDuration, formatRelativeTime, statusVariant } from "../lib/status.ts";
import { WorkflowFileTree } from "./WorkflowFileTree.tsx";
import { WorkflowFileViewer } from "./WorkflowFileViewer.tsx";
import { StepLogViewer } from "./StepLogViewer.tsx";
import {
  Badge,
  Button,
  cn,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@ritaj/ui";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ritaj/ui/components/table";

import { Play } from "lucide-react";

/** What the shared bottom-right viewer is currently showing: a workflow source file, or a run step's log. */
type ViewerContent =
  | { type: "file"; path: string }
  | { type: "step"; jobId: string; index: number; label: string }
  | null;

function RunsList(
  { workflowId, workflowName, selectedRunId, onSelectRun }: {
    workflowId: string;
    workflowName: string;
    selectedRunId: string | null;
    onSelectRun: (runId: string) => void;
  },
) {
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    setRuns(null);
    fetchRuns(workflowId).then(setRuns).catch((e) => setError(e.message));
  }, [workflowId]);

  async function handleRun() {
    setRunning(true);
    setRunError(null);
    try {
      await runWorkflow(workflowId);
      fetchRuns(workflowId).then(setRuns).catch((e) => setError(e.message));
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-lg font-medium">{workflowName}</h1>
        <Button size="sm" onClick={handleRun} disabled={running}>
          <Play />
          {running ? "Running…" : "Run"}
        </Button>
      </div>

      {runError && <p className="mb-4 text-sm text-destructive">{runError}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && !runs && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!error && runs && runs.length === 0 && (
        <p className="text-sm text-muted-foreground">No runs yet.</p>
      )}

      {!error && runs && runs.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Jobs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow
                key={run.runId}
                className={cn("cursor-pointer", run.runId === selectedRunId && "bg-accent")}
                onClick={() => onSelectRun(run.runId)}
              >
                <TableCell>
                  <Badge variant="secondary" className="font-mono">{run.runId.slice(0, 8)}</Badge>
                </TableCell>
                <TableCell title={new Date(run.startedAt).toLocaleString()}>
                  {formatRelativeTime(run.startedAt)}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                </TableCell>
                <TableCell>{formatDuration(run.startedAt, run.finishedAt)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(run.jobs).map(([jobId, status]) => (
                      <Badge key={jobId} variant={statusVariant(status)}>
                        {jobId}: {status}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function RunStepsPanel(
  { workflowId, runId, selectedStep, onSelectStep }: {
    workflowId: string;
    runId: string | null;
    selectedStep: { jobId: string; index: number } | null;
    onSelectStep: (jobId: string, index: number, label: string) => void;
  },
) {
  const [steps, setSteps] = useState<StepRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setSteps(null);
      setError(null);
      return;
    }
    setSteps(null);
    setError(null);
    fetchRunSteps(workflowId, runId).then(setSteps).catch((e) => setError(e.message));
  }, [workflowId, runId]);

  if (!runId) {
    return <p className="p-4 text-sm text-muted-foreground">Select a run to view its state.</p>;
  }

  const stepsByJob = new Map<string, StepRecord[]>();
  for (const step of steps ?? []) {
    const forJob = stepsByJob.get(step.jobId) ?? [];
    forJob.push(step);
    stepsByJob.set(step.jobId, forJob);
  }

  return (
    <div className="h-full overflow-auto p-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && !steps && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!error && steps && steps.length === 0 && (
        <p className="text-sm text-muted-foreground">No step data recorded for this run.</p>
      )}
      {!error && steps && steps.length > 0 && (
        <div className="flex flex-col gap-3">
          {[...stepsByJob.entries()].map(([jobId, jobSteps]) => (
            <div key={jobId}>
              <div className="mb-1 text-xs font-medium text-muted-foreground">{jobId}</div>
              <div className="flex flex-col gap-0.5">
                {jobSteps.sort((a, b) => a.index - b.index).map((step) => (
                  <button
                    type="button"
                    key={step.index}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                      selectedStep?.jobId === jobId && selectedStep.index === step.index && "bg-accent",
                    )}
                    onClick={() => onSelectStep(jobId, step.index, step.label)}
                  >
                    <span className="truncate">{step.label}</span>
                    <Badge variant={statusVariant(step.status)}>{step.status}</Badge>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkflowFilesPanel(
  { workflowId, runId, viewer, onSelectFile }: {
    workflowId: string;
    runId: string | null;
    viewer: ViewerContent;
    onSelectFile: (path: string) => void;
  },
) {
  const [files, setFiles] = useState<WorkflowFileNode[] | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  useEffect(() => {
    setFiles(null);
    setFilesError(null);
    fetchWorkflowFiles(workflowId).then(setFiles).catch((e) => setFilesError(e.message));
  }, [workflowId]);

  useEffect(() => {
    if (viewer?.type !== "file") return;
    setContent(null);
    setContentError(null);
    fetchWorkflowFileContent(workflowId, viewer.path).then(setContent).catch((e) => setContentError(e.message));
  }, [workflowId, viewer]);

  return (
    <ResizablePanelGroup className="h-full">
      <ResizablePanel defaultSize={20} minSize={15} className="border-r">
        {filesError && <p className="p-4 text-sm text-destructive">{filesError}</p>}
        {!filesError && !files && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        {!filesError && files && (
          <WorkflowFileTree
            files={files}
            selectedPath={viewer?.type === "file" ? viewer.path : null}
            onSelectFile={onSelectFile}
          />
        )}
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={80} minSize={30}>
        {viewer?.type === "step" && runId
          ? (
            <StepLogViewerHost
              workflowId={workflowId}
              runId={runId}
              jobId={viewer.jobId}
              index={viewer.index}
              label={viewer.label}
            />
          )
          : viewer?.type === "step"
          ? <p className="p-4 text-sm text-muted-foreground">Select a run to view step logs.</p>
          : (
            <WorkflowFileViewer
              path={viewer?.type === "file" ? viewer.path : null}
              content={content}
              error={contentError}
            />
          )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

/**
 * Wraps StepLogViewer with its own fetch — kept separate from RunStepsPanel
 * since a step's log is tied to the *viewer*'s selection (which can persist
 * across changing which run is selected in the left-hand list), not to the
 * steps list itself.
 */
function StepLogViewerHost(
  { workflowId, runId, jobId, index, label }: {
    workflowId: string;
    runId: string;
    jobId: string;
    index: number;
    label: string;
  },
) {
  const [log, setLog] = useState<StepLog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLog(null);
    setError(null);
    fetchStepLog(workflowId, runId, jobId, index).then(setLog).catch((e) => setError(e.message));
  }, [workflowId, runId, jobId, index]);

  return <StepLogViewer jobId={jobId} label={label} log={log} error={error} />;
}

export function RunsView() {
  const { workflowId = "" } = useParams();
  const workflowName = workflowId ? decodeWorkflowId(workflowId) : "";
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerContent>(null);

  useEffect(() => {
    setSelectedRunId(null);
    setViewer(null);
  }, [workflowId]);

  return (
    <div className="min-h-0 flex-1">
      <ResizablePanelGroup className="h-full">
        <ResizablePanel defaultSize={40} minSize={25}>
          <RunsList
            workflowId={workflowId}
            workflowName={workflowName}
            selectedRunId={selectedRunId}
            onSelectRun={setSelectedRunId}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={60} minSize={25}>
          <ResizablePanelGroup orientation="vertical" className="h-full">
            <ResizablePanel defaultSize={35} minSize={15} className="border-b">
              <RunStepsPanel
                workflowId={workflowId}
                runId={selectedRunId}
                selectedStep={viewer?.type === "step" ? { jobId: viewer.jobId, index: viewer.index } : null}
                onSelectStep={(jobId, index, label) => setViewer({ type: "step", jobId, index, label })}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={65} minSize={30}>
              <WorkflowFilesPanel
                workflowId={workflowId}
                runId={selectedRunId}
                viewer={viewer}
                onSelectFile={(path) => setViewer({ type: "file", path })}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
