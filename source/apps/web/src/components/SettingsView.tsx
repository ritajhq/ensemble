import { Settings as SettingsIcon, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  deleteWorkflow,
  fetchWorkflow,
  renameWorkflow,
  type WorkflowSummary,
} from "../lib/api.ts";
import { isPinned, togglePin } from "../lib/pins.ts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Card,
  Input,
} from "@ritaj/ui";

function Section(
  { title, description, children }: {
    title: string;
    description?: string;
    children: React.ReactNode;
  },
) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-col gap-1 border-b px-4 py-3">
        <span className="text-sm font-medium">{title}</span>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}

function GeneralSection(
  { workflow, onRenamed }: {
    workflow: WorkflowSummary;
    onRenamed: (workflow: WorkflowSummary) => void;
  },
) {
  const [name, setName] = useState(workflow.name);
  const [status, setStatus] = useState<
    { state: "idle" } | { state: "loading" } | {
      state: "error";
      message: string;
    }
  >({ state: "idle" });

  useEffect(() => {
    setName(workflow.name);
    setStatus({ state: "idle" });
  }, [workflow.name]);

  const dirty = name.trim().length > 0 && name.trim() !== workflow.name;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ state: "loading" });
    try {
      const wasPinned = isPinned(workflow.name);
      const renamed = await renameWorkflow(workflow.id, name.trim());
      if (wasPinned) {
        togglePin(workflow.name);
        togglePin(renamed.name);
      }
      setStatus({ state: "idle" });
      onRenamed(renamed);
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <Section title="General">
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1">
          <label
            className="text-xs text-muted-foreground"
            htmlFor="workflow-name"
          >
            Name
          </label>
          <Input
            id="workflow-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
        <div>
          <Button type="submit" disabled={status.state === "loading" || !dirty}>
            {status.state === "loading" ? "Saving…" : "Save"}
          </Button>
        </div>
        {status.state === "error" && (
          <p className="text-sm text-destructive">{status.message}</p>
        )}
      </form>
    </Section>
  );
}

function DangerZoneSection({ workflow }: { workflow: WorkflowSummary }) {
  const navigate = useNavigate();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove() {
    setRemoving(true);
    setError(null);
    try {
      await deleteWorkflow(workflow.id);
      if (isPinned(workflow.name)) togglePin(workflow.name);
      navigate("/workflows");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRemoving(false);
    }
  }

  return (
    <Card className="gap-0 border-destructive/30 py-0">
      <div className="flex flex-col gap-1 border-b border-destructive/30 px-4 py-3">
        <span className="text-sm font-medium text-destructive">
          Danger zone
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Unregister this workflow</p>
          <p className="text-xs text-muted-foreground">
            Permanently deletes "{workflow.name}"'s directory, drops any git
            link it has, and clears its run history. Secrets committed to a
            linked repository are not removed.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button variant="destructive" disabled={removing} />}
          >
            <Trash2 className="size-4" /> Unregister
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unregister this workflow?</AlertDialogTitle>
              <AlertDialogDescription>
                "{workflow.name}" and its run history will be permanently
                deleted, and any git link it has will be dropped. This can't
                be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex justify-end gap-2 p-4 pt-0">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleRemove}>
                Unregister
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {error && <p className="px-4 pb-4 text-sm text-destructive">{error}</p>}
    </Card>
  );
}

export function SettingsView() {
  const { workflowId = "" } = useParams();
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState<WorkflowSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkflow(workflowId)
      .then(setWorkflow)
      .catch((error) =>
        setLoadError(error instanceof Error ? error.message : String(error))
      );
  }, [workflowId]);

  function handleRenamed(renamed: WorkflowSummary) {
    if (renamed.id !== workflowId) {
      navigate(`/workflows/${renamed.id}/settings`, { replace: true });
      return;
    }
    setWorkflow(renamed);
  }

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-auto scroll-stable p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <SettingsIcon className="size-6" />
          <div>
            <h1 className="text-xl font-semibold">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Manage this workflow's name and lifecycle.
            </p>
          </div>
        </div>

        {loadError && <p className="text-sm text-destructive">{loadError}</p>}
        {!loadError && !workflow && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        {workflow && (
          <>
            <GeneralSection workflow={workflow} onRenamed={handleRenamed} />
            <DangerZoneSection workflow={workflow} />
          </>
        )}
      </div>
    </div>
  );
}
