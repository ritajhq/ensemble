import { ChevronDown, ChevronRight, GitBranch, Plus, RefreshCw, RotateCcw, Search, Trash2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  cloneGitWorkflows,
  fetchGitRepositories,
  type GitRepositorySummary,
  refreshGitRepository,
  removeGitRepository,
  removeGitRepositoryWorkflow,
  restoreGitRepositoryWorkflow,
} from "../lib/api.ts";
import { deriveProjectName } from "../lib/git.ts";
import { formatRelativeTime } from "../lib/status.ts";
import {
  Button,
  Card,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@ritaj/ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ritaj/ui/components/ui/table";

export function GitIntegrationView() {
  const [addOpen, setAddOpen] = useState(false);
  const [repositories, setRepositories] = useState<GitRepositorySummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  function refetchRepositories() {
    fetchGitRepositories().then(setRepositories).catch((error) => setListError(error.message));
  }

  useEffect(() => {
    refetchRepositories();
  }, []);

  const filtered = useMemo(() => {
    if (!repositories) return repositories;
    const query = search.trim().toLowerCase();
    if (!query) return repositories;
    return repositories.filter((repository) =>
      repository.projectName.toLowerCase().includes(query) ||
      repository.repoUrl.toLowerCase().includes(query)
    );
  }, [repositories, search]);

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-auto p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <GitBranch className="size-6" />
            <div>
              <h1 className="text-xl font-semibold">Git</h1>
              <p className="text-sm text-muted-foreground">Integrate repositories to pull in their workflows.</p>
            </div>
          </div>
          <Sheet open={addOpen} onOpenChange={setAddOpen}>
            <SheetTrigger render={<Button />}>
              <Plus className="size-4" /> Add repository
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Add a repository</SheetTitle>
                <SheetDescription>
                  Clones only the repository's <code>workflows/</code> folder (sparse checkout, no
                  other files) and places it under <code>workflows/&lt;project name&gt;/</code> here, so
                  its workflows show up without colliding with anything already local.
                </SheetDescription>
              </SheetHeader>
              <AddRepositoryForm
                onAdded={() => {
                  setAddOpen(false);
                  refetchRepositories();
                }}
              />
            </SheetContent>
          </Sheet>
        </div>

        <InputGroup className="max-w-sm">
          <InputGroupAddon>
            <Search className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search repositories..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </InputGroup>

        {listError && <p className="text-sm text-destructive">{listError}</p>}
        {!listError && !filtered && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!listError && filtered && (
          <RepositoriesTable repositories={filtered} onChange={refetchRepositories} />
        )}
      </div>
    </div>
  );
}

function AddRepositoryForm({ onAdded }: { onAdded: () => void }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectNameEdited, setProjectNameEdited] = useState(false);
  const [status, setStatus] = useState<
    { state: "idle" } | { state: "loading" } | { state: "error"; message: string }
  >({ state: "idle" });

  function handleRepoUrlChange(value: string) {
    setRepoUrl(value);
    if (!projectNameEdited) {
      setProjectName(deriveProjectName(value));
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ state: "loading" });
    try {
      await cloneGitWorkflows(repoUrl.trim(), projectName.trim() || undefined);
      setRepoUrl("");
      setProjectName("");
      setProjectNameEdited(false);
      setStatus({ state: "idle" });
      onAdded();
    } catch (error) {
      setStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <form className="flex flex-col gap-3 p-4 pt-0" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="git-repo-url">
          Repository URL
        </label>
        <Input
          id="git-repo-url"
          placeholder="https://github.com/acme/widgets.git"
          value={repoUrl}
          onChange={(event) => handleRepoUrlChange(event.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="git-project-name">
          Project name <span className="text-muted-foreground">(optional — defaults to the repo name)</span>
        </label>
        <Input
          id="git-project-name"
          placeholder="widgets"
          value={projectName}
          onChange={(event) => {
            setProjectName(event.target.value);
            setProjectNameEdited(true);
          }}
        />
      </div>
      <div>
        <Button type="submit" disabled={status.state === "loading" || repoUrl.trim().length === 0}>
          {status.state === "loading" ? "Cloning…" : "Clone workflows"}
        </Button>
      </div>
      {status.state === "error" && <p className="text-sm text-destructive">{status.message}</p>}
    </form>
  );
}

function RepositoriesTable(
  { repositories, onChange }: { repositories: GitRepositorySummary[]; onChange: () => void },
) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function toggleExpanded(projectName: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(projectName)) {
        next.delete(projectName);
      } else {
        next.add(projectName);
      }
      return next;
    });
  }

  async function runAction(key: string, action: () => Promise<void>) {
    setPendingAction(key);
    setActionError(null);
    try {
      await action();
      onChange();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Project</TableHead>
              <TableHead>Repository</TableHead>
              <TableHead>Last synced</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {repositories.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No repositories found.
                </TableCell>
              </TableRow>
            )}
            {repositories.map((repository) => {
              const isExpanded = expanded.has(repository.projectName);
              const refreshKey = `refresh:${repository.projectName}`;
              const removeKey = `remove:${repository.projectName}`;
              return (
                <Fragment key={repository.projectName}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => toggleExpanded(repository.projectName)}
                  >
                    <TableCell>
                      {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </TableCell>
                    <TableCell className="font-medium">{repository.projectName}</TableCell>
                    <TableCell className="text-muted-foreground">{repository.repoUrl}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatRelativeTime(repository.clonedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-foreground"
                          disabled={pendingAction === refreshKey}
                          onClick={(event) => {
                            event.stopPropagation();
                            runAction(refreshKey, () => refreshGitRepository(repository.projectName));
                          }}
                        >
                          <RefreshCw className={pendingAction === refreshKey ? "size-3.5 animate-spin" : "size-3.5"} />
                          <span className="sr-only">Refresh</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={pendingAction === removeKey}
                          onClick={(event) => {
                            event.stopPropagation();
                            runAction(removeKey, () => removeGitRepository(repository.projectName));
                          }}
                        >
                          <Trash2 className="size-3.5" />
                          <span className="sr-only">Remove</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <WorkflowSubrows
                      repository={repository}
                      pendingAction={pendingAction}
                      onAction={runAction}
                    />
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function WorkflowSubrows({
  repository,
  pendingAction,
  onAction,
}: {
  repository: GitRepositorySummary;
  pendingAction: string | null;
  onAction: (key: string, action: () => Promise<void>) => void;
}) {
  const rows = [
    ...repository.workflows.map((workflow) => ({ name: workflow.name, removed: false })),
    ...repository.removedWorkflows.map((name) => ({ name, removed: true })),
  ];

  if (rows.length === 0) {
    return (
      <TableRow>
        <TableCell />
        <TableCell colSpan={4} className="text-sm text-muted-foreground">No workflows.</TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {rows.map((row) => {
        const removeKey = `remove-workflow:${repository.projectName}:${row.name}`;
        const restoreKey = `restore-workflow:${repository.projectName}:${row.name}`;
        const refetchKey = `refetch-workflow:${repository.projectName}:${row.name}`;
        return (
          <TableRow key={row.name} className="bg-muted/30">
            <TableCell />
            <TableCell colSpan={2} className={row.removed ? "text-muted-foreground line-through" : ""}>
              {row.name}
            </TableCell>
            <TableCell className="text-muted-foreground">{row.removed ? "Removed" : ""}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                {row.removed
                  ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-foreground"
                      disabled={pendingAction === restoreKey}
                      onClick={() =>
                        onAction(restoreKey, () => restoreGitRepositoryWorkflow(repository.projectName, row.name))}
                    >
                      <RotateCcw className={pendingAction === restoreKey ? "size-3.5 animate-spin" : "size-3.5"} />
                      <span className="sr-only">Add back</span>
                    </Button>
                  )
                  : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-foreground"
                        disabled={pendingAction === refetchKey}
                        title="Refetch from git"
                        onClick={() =>
                          onAction(refetchKey, () => restoreGitRepositoryWorkflow(repository.projectName, row.name))}
                      >
                        <RefreshCw className={pendingAction === refetchKey ? "size-3.5 animate-spin" : "size-3.5"} />
                        <span className="sr-only">Refetch</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={pendingAction === removeKey}
                        onClick={() =>
                          onAction(removeKey, () => removeGitRepositoryWorkflow(repository.projectName, row.name))}
                      >
                        <Trash2 className="size-3.5" />
                        <span className="sr-only">Remove</span>
                      </Button>
                    </>
                  )}
              </div>
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}
