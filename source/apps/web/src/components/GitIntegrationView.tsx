import {
  GitBranch,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  fetchGitRepositories,
  type GitAuthStrategy,
  type GitRepositorySummary,
  refreshGitRepository,
  registerGitRepository,
  removeGitRepository,
  setRepositorySecretsKey,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ritaj/ui/components/ui/table";

export function GitIntegrationView() {
  const [addOpen, setAddOpen] = useState(false);
  const [repositories, setRepositories] = useState<
    GitRepositorySummary[] | null
  >(null);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  function refetchRepositories() {
    fetchGitRepositories().then(setRepositories).catch((error) =>
      setListError(error.message)
    );
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
              <p className="text-sm text-muted-foreground">
                Register repositories so their content can be synced into
                workflows you create.
              </p>
            </div>
          </div>
          <Sheet open={addOpen} onOpenChange={setAddOpen}>
            <SheetTrigger render={<Button />}>
              <Plus className="size-4" /> Register repository
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Register a repository</SheetTitle>
                <SheetDescription>
                  Validates access to the repository — this doesn't create or
                  change any workflow. Once registered, sync a repository's
                  content into a workflow from that workflow's own page.
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
        {!listError && !filtered && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {!listError && filtered && (
          <RepositoriesTable
            repositories={filtered}
            onChange={refetchRepositories}
          />
        )}
      </div>
    </div>
  );
}

function AddRepositoryForm({ onAdded }: { onAdded: () => void }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectNameEdited, setProjectNameEdited] = useState(false);
  const [authType, setAuthType] = useState<"none" | "pat">("none");
  const [token, setToken] = useState("");
  const [secretsKey, setSecretsKey] = useState("");
  const [status, setStatus] = useState<
    { state: "idle" } | { state: "loading" } | {
      state: "error";
      message: string;
    }
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
      const auth: GitAuthStrategy = authType === "pat"
        ? { type: "pat", token: token.trim() }
        : { type: "none" };
      await registerGitRepository(
        repoUrl.trim(),
        projectName.trim() || undefined,
        auth,
        secretsKey.trim() || undefined,
      );
      setRepoUrl("");
      setProjectName("");
      setProjectNameEdited(false);
      setAuthType("none");
      setToken("");
      setSecretsKey("");
      setStatus({ state: "idle" });
      onAdded();
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : String(error),
      });
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
        <label
          className="text-xs text-muted-foreground"
          htmlFor="git-project-name"
        >
          Project name{" "}
          <span className="text-muted-foreground">
            (optional — defaults to the repo name)
          </span>
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
      <div className="flex flex-col gap-1">
        <label
          className="text-xs text-muted-foreground"
          htmlFor="git-auth-type"
        >
          Access
        </label>
        <Select
          value={authType}
          onValueChange={(value) => setAuthType(value as "none" | "pat")}
        >
          <SelectTrigger id="git-auth-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Public — no credentials</SelectItem>
            <SelectItem value="pat">Personal access token</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {authType === "pat" && (
        <div className="flex flex-col gap-1">
          <label
            className="text-xs text-muted-foreground"
            htmlFor="git-pat-token"
          >
            Personal access token
          </label>
          <Input
            id="git-pat-token"
            type="password"
            placeholder="ghp_…"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
          />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label
          className="text-xs text-muted-foreground"
          htmlFor="git-secrets-key"
        >
          Secrets private key{" "}
          <span className="text-muted-foreground">(optional)</span>
        </label>
        <Input
          id="git-secrets-key"
          type="password"
          placeholder="Contents of this repo's .ensemble/secrets.key"
          value={secretsKey}
          onChange={(event) => setSecretsKey(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Lets workflows from this repo decrypt their context.secrets when
          triggered here. Leave blank if this repo has no encrypted secrets —
          you can set this later too.
        </p>
      </div>
      <div>
        <Button
          type="submit"
          disabled={status.state === "loading" || repoUrl.trim().length === 0 ||
            (authType === "pat" && token.trim().length === 0)}
        >
          {status.state === "loading" ? "Registering…" : "Register"}
        </Button>
      </div>
      {status.state === "error" && (
        <p className="text-sm text-destructive">{status.message}</p>
      )}
    </form>
  );
}

function RotateSecretsKeyForm(
  { onRotated }: { onRotated: (secretsKey: string) => Promise<void> },
) {
  const [secretsKey, setSecretsKey] = useState("");
  const [status, setStatus] = useState<
    { state: "idle" } | { state: "loading" } | {
      state: "error";
      message: string;
    }
  >({ state: "idle" });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ state: "loading" });
    try {
      await onRotated(secretsKey.trim());
      setSecretsKey("");
      setStatus({ state: "idle" });
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <form className="flex flex-col gap-3 p-4 pt-0" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1">
        <label
          className="text-xs text-muted-foreground"
          htmlFor="rotate-secrets-key"
        >
          Secrets private key
        </label>
        <Input
          id="rotate-secrets-key"
          type="password"
          placeholder="Contents of this repo's .ensemble/secrets.key"
          value={secretsKey}
          onChange={(event) => setSecretsKey(event.target.value)}
          required
        />
      </div>
      <div>
        <Button
          type="submit"
          disabled={status.state === "loading" ||
            secretsKey.trim().length === 0}
        >
          {status.state === "loading" ? "Saving…" : "Save"}
        </Button>
      </div>
      {status.state === "error" && (
        <p className="text-sm text-destructive">{status.message}</p>
      )}
    </form>
  );
}

function RepositoriesTable(
  { repositories, onChange }: {
    repositories: GitRepositorySummary[];
    onChange: () => void;
  },
) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rotatingKeyFor, setRotatingKeyFor] = useState<string | null>(null);

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
              <TableHead>Project</TableHead>
              <TableHead>Repository</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Secrets key</TableHead>
              <TableHead>Last fetched</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {repositories.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  No repositories registered.
                </TableCell>
              </TableRow>
            )}
            {repositories.map((repository) => {
              const refreshKey = `refresh:${repository.projectName}`;
              const removeKey = `remove:${repository.projectName}`;
              return (
                <TableRow key={repository.projectName}>
                  <TableCell className="font-medium">
                    {repository.projectName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {repository.repoUrl}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {repository.authType === "pat" ? "Token" : "Public"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {repository.hasSecretsKey ? "Set" : "Not set"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {repository.lastFetchedAt
                      ? formatRelativeTime(repository.lastFetchedAt)
                      : "Never"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Sheet
                        open={rotatingKeyFor === repository.projectName}
                        onOpenChange={(open) =>
                          setRotatingKeyFor(
                            open ? repository.projectName : null,
                          )}
                      >
                        <SheetTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:text-foreground"
                              title={repository.hasSecretsKey
                                ? "Rotate secrets key"
                                : "Set secrets key"}
                            />
                          }
                        >
                          <KeyRound className="size-3.5" />
                          <span className="sr-only">
                            {repository.hasSecretsKey
                              ? "Rotate secrets key"
                              : "Set secrets key"}
                          </span>
                        </SheetTrigger>
                        <SheetContent>
                          <SheetHeader>
                            <SheetTitle>
                              {repository.hasSecretsKey ? "Rotate" : "Set"}{" "}
                              secrets key
                            </SheetTitle>
                            <SheetDescription>
                              Workflows linked to "{repository.projectName}"
                              will use this key to decrypt their context.secrets
                              when triggered here.
                            </SheetDescription>
                          </SheetHeader>
                          <RotateSecretsKeyForm
                            onRotated={async (secretsKey) => {
                              await setRepositorySecretsKey(
                                repository.projectName,
                                secretsKey,
                              );
                              setRotatingKeyFor(null);
                              onChange();
                            }}
                          />
                        </SheetContent>
                      </Sheet>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-foreground"
                        disabled={pendingAction === refreshKey}
                        onClick={() =>
                          runAction(
                            refreshKey,
                            () => refreshGitRepository(repository.projectName),
                          )}
                      >
                        <RefreshCw
                          className={pendingAction === refreshKey
                            ? "size-3.5 animate-spin"
                            : "size-3.5"}
                        />
                        <span className="sr-only">Refresh</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={pendingAction === removeKey}
                        title="Unregister — workflows previously synced from this repo keep their last-synced content"
                        onClick={() =>
                          runAction(
                            removeKey,
                            () => removeGitRepository(repository.projectName),
                          )}
                      >
                        <Trash2 className="size-3.5" />
                        <span className="sr-only">Unregister</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
