import { useState } from "react";
import {
  useActionData,
  useLoaderData,
  useNavigation,
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

/** A project id for `repository`: its name, as a short DNS label. */
function suggestedId(repository: Repository): string {
  const name = repository.fullName.split("/")[1] ?? "";
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 20)
    .replace(/^-+|-+$/g, "");
}

/** What adding a project came to, when it didn't go to the new project. */
export interface AddProjectOutcome {
  readonly error: string;
}

/** Adds a repository the GitHub App is installed on as a project; its manifests are read once it's checked out. */
export function AddProject() {
  const repositories = useLoaderData() as AddProjectData;
  const submit = useSubmit();
  const outcome = useActionData() as AddProjectOutcome | undefined;
  const busy = useNavigation().state === "submitting";
  const [repository, setRepository] = useState("");
  const [id, setId] = useState("");
  const [ref, setRef] = useState("main");
  const AddIcon = useIcon("plus");

  function pick(fullName: string) {
    setRepository(fullName);
    const picked = repositories.value?.find((found) =>
      found.fullName === fullName
    );
    if (!picked) return;
    setRef(picked.defaultBranch);
    setId(suggestedId(picked));
  }

  function add() {
    submit({ id, repository, ref }, { method: "post" });
  }

  return (
    <Panel
      title="Add a project"
      description="Pick a repository one of the platform's GitHub Apps is installed on. The id names the project's checkout, and every deployment of it starts with it: keep it short."
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
            label="Id"
            placeholder="portal"
            value={id}
            onChange={setId}
          />
          <InputField
            index={1}
            label="Branch"
            placeholder="main"
            value={ref}
            onChange={setRef}
          />
        </InputGroup>
        <div>
          <Button
            type="submit"
            leadingIcon={AddIcon}
            loading={busy}
            disabled={busy || !id.trim() || !repository}
          >
            {busy ? "Adding…" : "Add"}
          </Button>
        </div>
      </form>
      {outcome && <Notice tone="error">{outcome.error}</Notice>}
    </Panel>
  );
}
