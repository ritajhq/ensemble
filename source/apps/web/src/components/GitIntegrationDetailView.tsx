import { ArrowLeft, GitBranch, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  fetchGitRepositories,
  type GitAuthStrategy,
  type GitRepositorySummary,
  removeGitRepository,
  setRepositoryAuth,
  setRepositorySecretsKey,
} from "../lib/api.ts";
import { formatRelativeTime } from "../lib/status.ts";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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

function AccessSection(
  { repository, onChanged }: {
    repository: GitRepositorySummary;
    onChanged: () => void;
  },
) {
  const [authType, setAuthType] = useState<"none" | "pat">(
    repository.authType,
  );
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<
    { state: "idle" } | { state: "loading" } | {
      state: "error";
      message: string;
    }
  >({ state: "idle" });

  useEffect(() => {
    setAuthType(repository.authType);
    setToken("");
    setStatus({ state: "idle" });
  }, [repository.projectName, repository.authType]);

  const dirty = authType !== repository.authType ||
    (authType === "pat" && token.trim().length > 0);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ state: "loading" });
    try {
      const auth: GitAuthStrategy = authType === "pat"
        ? { type: "pat", token: token.trim() }
        : { type: "none" };
      await setRepositoryAuth(repository.projectName, auth);
      setToken("");
      setStatus({ state: "idle" });
      onChanged();
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <Section
      title="Access"
      description="How the server authenticates to this repository when cloning or committing on your behalf."
    >
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
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
            <SelectTrigger id="git-auth-type" className="w-full max-w-xs">
              <SelectValue>
                {() =>
                  authType === "pat"
                    ? "Personal access token"
                    : "Public — no credentials"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Public — no credentials</SelectItem>
              <SelectItem value="pat">Personal access token</SelectItem>
            </SelectContent>
          </Select>
          {authType === "none" && (
            <p className="text-xs text-muted-foreground">
              Read-only — this repo's workflows can sync content, but can't
              use encrypted secrets or the dashboard secrets editor (both
              need write access to commit on your behalf). Switch to a
              personal access token with write scope to enable those.
            </p>
          )}
        </div>
        {authType === "pat" && (
          <div className="flex flex-col gap-1">
            <label
              className="text-xs text-muted-foreground"
              htmlFor="git-pat-token"
            >
              Personal access token{" "}
              {repository.authType === "pat" && (
                <span className="text-muted-foreground">
                  (already set — paste a new one to rotate it)
                </span>
              )}
            </label>
            <Input
              id="git-pat-token"
              type="password"
              placeholder={repository.authType === "pat"
                ? "•••••••••••••••• (leave blank to keep)"
                : "ghp_…"}
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required={repository.authType !== "pat"}
            />
          </div>
        )}
        <div>
          <Button
            type="submit"
            disabled={status.state === "loading" || !dirty ||
              (authType === "pat" && repository.authType !== "pat" &&
                token.trim().length === 0)}
          >
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

function SecretsKeySection(
  { repository, onChanged }: {
    repository: GitRepositorySummary;
    onChanged: () => void;
  },
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
      await setRepositorySecretsKey(repository.projectName, secretsKey.trim());
      setSecretsKey("");
      setStatus({ state: "idle" });
      onChanged();
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <Section
      title="Secrets key"
      description="This repository's X25519 private key — lets workflows linked to it decrypt their context.secrets when triggered here."
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          {repository.hasSecretsKey
            ? "A secrets key is set."
            : "No secrets key set."}
        </p>
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1">
            <label
              className="text-xs text-muted-foreground"
              htmlFor="git-secrets-key"
            >
              {repository.hasSecretsKey
                ? "Rotate secrets key"
                : "Set secrets key"}
            </label>
            <Input
              id="git-secrets-key"
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
      </div>
    </Section>
  );
}

function DangerZoneSection(
  { repository }: { repository: GitRepositorySummary },
) {
  const navigate = useNavigate();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove() {
    setRemoving(true);
    setError(null);
    try {
      await removeGitRepository(repository.projectName);
      navigate("/integrations/git");
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
          <p className="text-sm font-medium">Unregister this repository</p>
          <p className="text-xs text-muted-foreground">
            Workflows previously synced from "{repository.projectName}" keep
            their last-synced content — this only removes the registration
            (URL, access, secrets key) itself.
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
              <AlertDialogTitle>Unregister this repository?</AlertDialogTitle>
              <AlertDialogDescription>
                "{repository.projectName}" will no longer be a source for
                creating or syncing workflows, and any secrets key stored for
                it will be gone. Workflows already synced from it keep their
                last-synced content. This can't be undone.
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
      {error && (
        <p className="px-4 pb-4 text-sm text-destructive">{error}</p>
      )}
    </Card>
  );
}

export function GitIntegrationDetailView() {
  const { projectName = "" } = useParams();
  const navigate = useNavigate();
  const [repository, setRepository] = useState<GitRepositorySummary | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  function refetch() {
    fetchGitRepositories()
      .then((repositories) => {
        const found = repositories.find((r) => r.projectName === projectName);
        if (!found) {
          setLoadError(`Repository "${projectName}" isn't registered.`);
          setRepository(null);
          return;
        }
        setRepository(found);
        setLoadError(null);
      })
      .catch((error) =>
        setLoadError(error instanceof Error ? error.message : String(error))
      );
  }

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName]);

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-auto scroll-stable p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/integrations/git")}
        >
          <ArrowLeft className="size-4" /> Git integrations
        </Button>

        {loadError && (
          <Card className="flex flex-row items-start gap-3 p-4">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{loadError}</p>
          </Card>
        )}

        {!loadError && !repository && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        {repository && (
          <>
            <div className="flex items-center gap-3">
              <GitBranch className="size-6" />
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold">
                  {repository.projectName}
                </h1>
                <p className="truncate text-sm text-muted-foreground">
                  {repository.repoUrl}
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Registered {formatRelativeTime(repository.registeredAt)} — last
              fetched{" "}
              {repository.lastFetchedAt
                ? formatRelativeTime(repository.lastFetchedAt)
                : "never"}
            </p>

            <AccessSection repository={repository} onChanged={refetch} />
            <SecretsKeySection repository={repository} onChanged={refetch} />
            <DangerZoneSection repository={repository} />
          </>
        )}
      </div>
    </div>
  );
}
