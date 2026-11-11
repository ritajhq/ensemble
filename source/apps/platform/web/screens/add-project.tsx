import { useState } from "react";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
  useSubmit,
} from "react-router";
import {
  Button,
  InputField,
  InputGroup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  useIcon,
} from "@ritaj/ui";
import type { Repository } from "../api.ts";
import { Notice } from "../components/notice.tsx";
import { Panel } from "../components/panel.tsx";
import type { AddProjectData } from "../routes.tsx";

/** The id the platform derives for `repository`: its name, as a short DNS label. */
function idOf(repository: string): string {
  const name = repository.split("/")[1] ?? "";
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 20)
    .replace(/^-+|-+$/g, "");
}

/** What adding a project came to, when it didn't go to the new project. */
export interface AddProjectOutcome {
  readonly error: string;
}

/** The repository among those reachable that `fullName` names, GitHub's case aside. */
function find(
  repositories: readonly Repository[] | undefined,
  fullName: string,
): Repository | undefined {
  const wanted = fullName.toLowerCase();
  return repositories?.find((found) => found.fullName.toLowerCase() === wanted);
}

/**
 * Adds a repository the GitHub App is installed on as a project; its manifests
 * are read once it's checked out. `?repository=owner/name` picks one already,
 * as the deployments screen does for a stack no project claims.
 */
export function AddProject() {
  const repositories = useLoaderData() as AddProjectData;
  const [search] = useSearchParams();
  const submit = useSubmit();
  const outcome = useActionData() as AddProjectOutcome | undefined;
  const busy = useNavigation().state === "submitting";
  const asked = search.get("repository") ?? "";
  const preselected = find(repositories.value, asked);
  const [repository, setRepository] = useState(preselected?.fullName ?? "");
  const [ref, setRef] = useState(preselected?.defaultBranch ?? "main");
  const AddIcon = useIcon("plus");
  const id = idOf(repository);

  function pick(fullName: string) {
    setRepository(fullName);
    const picked = find(repositories.value, fullName);
    if (!picked) return;
    setRef(picked.defaultBranch);
  }

  function add() {
    submit({ repository, ref }, { method: "post" });
  }

  return (
    <Panel
      title="Add a project"
      description="Pick a repository one of the platform's GitHub Apps is installed on. The project is the repository, named after it."
    >
      {repositories.error && (
        <Notice
          tone="warning"
          details="Set up a GitHub App under Integrations › GitHub, and install it on the repository."
        >
          {repositories.error}
        </Notice>
      )}
      {repositories.value?.length === 0 && (
        <Notice tone="info">
          No GitHub App of the platform is installed on a repository yet:
          install one from Integrations › GitHub.
        </Notice>
      )}
      {asked && repositories.value && !preselected && (
        <Notice
          tone="warning"
          details="Install one of the platform's GitHub Apps on it from Integrations › GitHub, then come back."
        >
          No GitHub App of the platform can reach {asked}.
        </Notice>
      )}
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <Select value={repository} onValueChange={pick}>
          <SelectTrigger
            aria-label="Repository"
            className="w-full max-w-md"
            placeholder="Repository"
          />
          <SelectContent>
            {(repositories.value ?? []).map((found, i) => (
              <SelectItem key={found.fullName} index={i} value={found.fullName}>
                {found.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <InputGroup>
          <InputField
            index={0}
            label="Branch"
            placeholder="main"
            value={ref}
            onChange={setRef}
          />
        </InputGroup>
        {id && (
          <p className="text-caption text-muted-foreground">
            Checked out and deployed as <span className="font-mono">{id}</span>.
          </p>
        )}
        <div>
          <Button
            type="submit"
            leadingIcon={AddIcon}
            loading={busy}
            disabled={busy || !id || !ref.trim()}
          >
            {busy ? "Adding…" : "Add"}
          </Button>
        </div>
      </form>
      {outcome && <Notice tone="error">{outcome.error}</Notice>}
    </Panel>
  );
}
