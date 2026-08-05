import { ArrowRight, Pin, PinOff, Search, Workflow as WorkflowIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { fetchWorkflows, type WorkflowSummary } from "../lib/api.ts";
import { isPinned, togglePin, usePinnedWorkflows } from "../lib/pins.ts";
import { formatRelativeTime, statusVariant } from "../lib/status.ts";
import { Badge, Button, Card, CardContent, CardFooter, CardHeader, InputGroup, InputGroupAddon, InputGroupInput } from "@ritaj/ui";

export function WorkflowsView() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
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

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <WorkflowIcon className="size-6" />
          <div>
            <h1 className="text-xl font-semibold">Workflows</h1>
            <p className="text-sm text-muted-foreground">Trigger and monitor your workflow runs.</p>
          </div>
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
          <p className="text-sm text-muted-foreground">No workflows found.</p>
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
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 pt-4 pb-0">
        <div className="flex min-w-0 items-center gap-2">
          <WorkflowIcon className="size-4 shrink-0 text-muted-foreground" />
          <Link to={`/workflows/${workflow.id}`} className="truncate font-medium hover:underline">
            {workflow.name}
          </Link>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground hover:text-foreground data-[pinned=true]:text-foreground"
          data-pinned={isPinned(workflow.name)}
          onClick={() => togglePin(workflow.name)}
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
        <Link
          to={`/workflows/${workflow.id}`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          View runs
          <ArrowRight className="size-3.5" />
        </Link>
      </CardFooter>
    </Card>
  );
}
