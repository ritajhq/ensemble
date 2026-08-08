import { ArrowRight, Pin, PinOff, Plus, Search, Workflow as WorkflowIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  createWorkflow,
  fetchGitRepositories,
  fetchRepoWorkflowCandidates,
  fetchWorkflows,
  type GitRepositorySummary,
  type RepoWorkflowCandidate,
  type WorkflowSummary,
} from "../lib/api.ts";
import { isPinned, togglePin, usePinnedWorkflows } from "../lib/pins.ts";
import { formatRelativeTime, statusVariant } from "../lib/status.ts";
import { TriggerIcon, triggerTypeLabel } from "../lib/triggers.tsx";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@ritaj/ui";

/** Picks a registered repo's own candidate workflow to seed a new workflow's content from — separate from the "empty" default. */
function GitSourcePicker({
  projectName,
  pathInRepo,
  onProjectNameChange,
  onPathInRepoChange,
}: {
  projectName: string;
  pathInRepo: string;
  onProjectNameChange: (value: string) => void;
  onPathInRepoChange: (value: string) => void;
}) {
  const [repositories, setRepositories] = useState<GitRepositorySummary[] | null>(null);
  const [candidates, setCandidates] = useState<RepoWorkflowCandidate[] | null>(null);

  useEffect(() => {
    fetchGitRepositories().then(setRepositories).catch(() => setRepositories([]));
  }, []);

  useEffect(() => {
    setCandidates(null);
    onPathInRepoChange("");
    if (!projectName) return;
    fetchRepoWorkflowCandidates(projectName).then(setCandidates).catch(() => setCandidates([]));
  }, [projectName]);

  if (repositories && repositories.length === 0) {
    return <p className="text-sm text-muted-foreground">No repositories registered — register one under Git.</p>;
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="new-workflow-repo">
          Repository
        </label>
        <Select value={projectName || undefined} onValueChange={(value) => onProjectNameChange(value ?? "")}>
          <SelectTrigger id="new-workflow-repo" className="w-full">
            <SelectValue placeholder={repositories ? "Select a repository…" : "Loading…"} />
          </SelectTrigger>
          <SelectContent>
            {(repositories ?? []).map((repository) => (
              <SelectItem key={repository.projectName} value={repository.projectName}>
                {repository.projectName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {projectName && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="new-workflow-path">
            Workflow
          </label>
          <Select value={pathInRepo || undefined} onValueChange={(value) => onPathInRepoChange(value ?? "")}>
            <SelectTrigger id="new-workflow-path" className="w-full">
              <SelectValue placeholder={candidates ? "Select a workflow…" : "Loading…"} />
            </SelectTrigger>
            <SelectContent>
              {(candidates ?? []).map((candidate) => (
                <SelectItem key={candidate.pathInRepo} value={candidate.pathInRepo}>
                  {candidate.pathInRepo}
                  {!candidate.hasTrigger && " (no trigger)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {candidates && candidates.length === 0 && (
            <p className="text-xs text-muted-foreground">No workflow.yml found in this repository.</p>
          )}
        </div>
      )}
    </>
  );
}

function NewWorkflowForm({ onCreated }: { onCreated: (workflow: WorkflowSummary) => void }) {
  const [name, setName] = useState("");
  const [source, setSource] = useState<"empty" | "git">("empty");
  const [projectName, setProjectName] = useState("");
  const [pathInRepo, setPathInRepo] = useState("");
  const [status, setStatus] = useState<
    { state: "idle" } | { state: "loading" } | { state: "error"; message: string }
  >({ state: "idle" });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ state: "loading" });
    try {
      const workflow = await createWorkflow(
        name.trim(),
        source === "git" ? { projectName, pathInRepo } : undefined,
      );
      setName("");
      setProjectName("");
      setPathInRepo("");
      setStatus({ state: "idle" });
      onCreated(workflow);
    } catch (error) {
      setStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  const canSubmit = name.trim().length > 0 && (source === "empty" || (projectName.length > 0 && pathInRepo.length > 0));

  return (
    <form className="flex flex-col gap-3 p-4 pt-0" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="new-workflow-name">
          Name
        </label>
        <Input
          id="new-workflow-name"
          placeholder="my-workflow"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="new-workflow-source">
          Content
        </label>
        <Select value={source} onValueChange={(value) => setSource(value as "empty" | "git")}>
          <SelectTrigger id="new-workflow-source" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="empty">Empty — start from a minimal stub</SelectItem>
            <SelectItem value="git">From a registered repository</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {source === "git" && (
        <GitSourcePicker
          projectName={projectName}
          pathInRepo={pathInRepo}
          onProjectNameChange={setProjectName}
          onPathInRepoChange={setPathInRepo}
        />
      )}
      <div>
        <Button type="submit" disabled={status.state === "loading" || !canSubmit}>
          {status.state === "loading" ? "Creating…" : "Create"}
        </Button>
      </div>
      {status.state === "error" && <p className="text-sm text-destructive">{status.message}</p>}
    </form>
  );
}

export function WorkflowsView() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();
  usePinnedWorkflows();

  useEffect(() => {
    fetchWorkflows().then(setWorkflows).catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!workflows) return workflows;
    const query = search.trim().toLowerCase();
    if (!query) return workflows;
    return workflows.filter((workflow) => workflow.name.toLowerCase().includes(query));
  }, [workflows, search]);

  function handleCreated(workflow: WorkflowSummary) {
    setCreateOpen(false);
    navigate(`/workflows/${workflow.id}`);
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <WorkflowIcon className="size-6" />
            <div>
              <h1 className="text-xl font-semibold">Workflows</h1>
              <p className="text-sm text-muted-foreground">Trigger and monitor your workflow runs.</p>
            </div>
          </div>
          <Sheet open={createOpen} onOpenChange={setCreateOpen}>
            <SheetTrigger render={<Button />}>
              <Plus className="size-4" /> New workflow
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>New workflow</SheetTitle>
                <SheetDescription>
                  Start empty, or seed it from a workflow in one of your registered git
                  repositories.
                </SheetDescription>
              </SheetHeader>
              <NewWorkflowForm onCreated={handleCreated} />
            </SheetContent>
          </Sheet>
        </div>

        <InputGroup className="max-w-sm">
          <InputGroupAddon>
            <Search className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search workflows..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </InputGroup>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && !filtered && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!error && filtered && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No workflows yet — create one to get started.
          </p>
        )}

        {!error && filtered && filtered.length > 0 && (
          <div className="flex flex-col gap-4">
            {filtered.map((workflow) => (
              <WorkflowCard key={workflow.id} workflow={workflow} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkflowCard({ workflow }: { workflow: WorkflowSummary }) {
  const navigate = useNavigate();

  return (
    <Card
      className="cursor-pointer gap-0 py-0"
      onClick={() => navigate(`/workflows/${workflow.id}`)}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 pt-4 pb-0">
        <div className="flex min-w-0 items-center gap-2">
          <WorkflowIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{workflow.name}</span>
          {workflow.triggers.map((trigger, index) => (
            <TriggerIcon
              key={index}
              trigger={trigger}
              className="size-3.5 shrink-0 text-muted-foreground"
              title={`${triggerTypeLabel(trigger.type)} trigger`}
            />
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground hover:text-foreground data-[pinned=true]:text-foreground"
          data-pinned={isPinned(workflow.name)}
          onClick={(event) => {
            event.stopPropagation();
            togglePin(workflow.name);
          }}
        >
          {isPinned(workflow.name) ? <Pin className="size-3.5 fill-current" /> : <PinOff className="size-3.5" />}
          <span className="sr-only">Toggle pin</span>
        </Button>
      </CardHeader>
      <CardContent className="px-4 py-4">
        {workflow.lastStatus
          ? (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant={statusVariant(workflow.lastStatus)}>{workflow.lastStatus}</Badge>
              {workflow.lastRunAt && (
                <span className="text-muted-foreground">{formatRelativeTime(workflow.lastRunAt)}</span>
              )}
            </div>
          )
          : <span className="text-sm text-muted-foreground">No runs yet.</span>}
      </CardContent>
      <CardFooter className="justify-between px-4 py-2.5">
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          View runs
          <ArrowRight className="size-3.5" />
        </span>
      </CardFooter>
    </Card>
  );
}
