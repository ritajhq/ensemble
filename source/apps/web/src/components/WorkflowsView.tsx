import { Pin, PinOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { fetchWorkflows, type WorkflowSummary } from "../lib/api.ts";
import { isPinned, togglePin, usePinnedWorkflows } from "../lib/pins.ts";
import { statusVariant } from "../lib/status.ts";
import { Badge, Button } from "@ritaj/ui";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@ritaj/ui/components/table";

export function WorkflowsView() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  usePinnedWorkflows();

  useEffect(() => {
    fetchWorkflows().then(setWorkflows).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="p-4 text-sm text-destructive">{error}</p>;
  if (!workflows) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-medium">Workflows</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Last status</TableHead>
            <TableHead>Last run</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {workflows.map((workflow) => (
            <TableRow
              key={workflow.id}
              className="group cursor-pointer"
              onClick={() => navigate(`/workflows/${workflow.id}`)}
            >
              <TableCell className="font-medium">{workflow.name}</TableCell>
              <TableCell>
                {workflow.lastStatus
                  ? <Badge variant={statusVariant(workflow.lastStatus)}>{workflow.lastStatus}</Badge>
                  : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell>
                {workflow.lastRunAt ? new Date(workflow.lastRunAt).toLocaleString() : "Never"}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground data-[pinned=true]:opacity-100"
                  data-pinned={isPinned(workflow.name)}
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePin(workflow.name);
                  }}
                >
                  {isPinned(workflow.name) ? <Pin className="size-3.5 fill-current" /> : <PinOff className="size-3.5" />}
                  <span className="sr-only">Toggle pin</span>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
