import { GitBranch } from "lucide-react";
import { useState } from "react";
import { cloneGitWorkflows } from "../lib/api.ts";
import { deriveProjectName } from "../lib/git.ts";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from "@ritaj/ui";

export function GitIntegrationView() {
  const [repoUrl, setRepoUrl] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectNameEdited, setProjectNameEdited] = useState(false);
  const [status, setStatus] = useState<
    { state: "idle" } | { state: "loading" } | { state: "error"; message: string } | {
      state: "success";
      projectName: string;
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
      const result = await cloneGitWorkflows(repoUrl.trim(), projectName.trim() || undefined);
      setStatus({ state: "success", projectName: result.projectName });
    } catch (error) {
      setStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <GitBranch className="size-6" />
        <h1 className="text-lg font-medium">Git</h1>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Add a repository</CardTitle>
          <CardDescription>
            Clones only the repository's <code>workflows/</code> folder (sparse checkout, no
            other files) and places it under <code>workflows/&lt;project name&gt;/</code> here, so
            its workflows show up without colliding with anything already local.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
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
            {status.state === "success" && (
              <p className="text-sm text-muted-foreground">
                Cloned into <code>workflows/{status.projectName}/</code>.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
