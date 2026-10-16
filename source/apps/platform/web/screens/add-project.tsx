import { useState } from "react";
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
import { describe, type Repository } from "../api.ts";
import { useApi } from "../api-provider.tsx";
import { Notice } from "../components/notice.tsx";
import { Panel } from "../components/panel.tsx";
import { useLoad } from "../use-load.ts";

/** A project id for `repository`: its name, as a short DNS label. */
function suggestedId(repository: Repository): string {
  const name = repository.fullName.split("/")[1] ?? "";
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 20)
    .replace(/^-+|-+$/g, "");
}

/** Adds a repository the GitHub App is installed on as a project; its manifests are read once it's checked out. */
export function AddProject({ onAdded }: { onAdded(id: string): void }) {
  const api = useApi();
  const repositories = useLoad(() => api.repositories(), []);
  const [repository, setRepository] = useState("");
  const [id, setId] = useState("");
  const [ref, setRef] = useState("main");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
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

  async function add() {
    setBusy(true);
    setError(undefined);
    try {
      const project = await api.addProject({
        id: id.trim(),
        repository,
        ref: ref.trim(),
      });
      onAdded(project.id);
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Add a project"
      description="Pick a repository the platform's GitHub App is installed on. The id names the project's checkout, and every deployment of it starts with it: keep it short."
    >
      {repositories.error && (
        <Notice
          tone="warning"
          details="Set up the GitHub App on the platform's home page, and install it on the repository."
        >
          {repositories.error}
        </Notice>
      )}
      {repositories.value?.length === 0 && (
        <Notice tone="info">
          The GitHub App isn't installed on any repository yet: install it from
          the platform's home page.
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
            placeholder={repositories.loading
              ? "Loading repositories…"
              : "Repository"}
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
      {error && <Notice tone="error">{error}</Notice>}
    </Panel>
  );
}
