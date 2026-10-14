import { useState } from "react";
import { Button, InputField, InputGroup, useIcon } from "@ritaj/ui";
import { describe } from "../api.ts";
import { useApi } from "../api-provider.tsx";
import { Notice } from "../components/notice.tsx";
import { Panel } from "../components/panel.tsx";

/** Adds a GitHub repository as a project; its manifests are read once it's checked out. */
export function AddProject({ onAdded }: { onAdded(id: string): void }) {
  const api = useApi();
  const [id, setId] = useState("");
  const [repository, setRepository] = useState("");
  const [ref, setRef] = useState("main");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const AddIcon = useIcon("plus");

  async function add() {
    setBusy(true);
    setError(undefined);
    try {
      const project = await api.addProject({
        id: id.trim(),
        repository: repository.trim(),
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
      description="The id names the project's checkout, and every deployment of it starts with it: keep it short."
    >
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
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
            label="Repository"
            placeholder="owner/name"
            value={repository}
            onChange={setRepository}
          />
          <InputField
            index={2}
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
            disabled={busy || !id.trim() || !repository.trim()}
          >
            {busy ? "Adding…" : "Add"}
          </Button>
        </div>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
    </Panel>
  );
}
