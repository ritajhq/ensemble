import { useState } from "react";
import { Badge, Button, InputField, InputGroup, useIcon } from "@ritaj/ui";
import { describe } from "../api.ts";
import { useApi } from "../api-provider.tsx";
import { Notice } from "./notice.tsx";
import { Panel } from "./panel.tsx";

/** What a project's releases publish with: registry passwords and tokens, set or cleared by name, never shown again. */
export function CredentialsPanel(
  { project, names, onChanged }: {
    project: string;
    names: readonly string[];
    onChanged(): void;
  },
) {
  const api = useApi();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const AddIcon = useIcon("plus");

  async function act(change: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await change();
      onChanged();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Release credentials"
      description="Handed to every release as environment variables of the same names (JSR_TOKEN, VSCE_PAT, GH_TOKEN…)."
    >
      {names.length > 0 && (
        <div className="grid gap-1">
          {names.map((credential) => (
            <div key={credential} className="flex items-center gap-2">
              <span className="font-mono text-caption">{credential}</span>
              <Badge color="amber">set</Badge>
              <Button
                variant="ghost"
                className="ml-auto"
                disabled={busy}
                onClick={() =>
                  act(() =>
                    api.unsetCredential(project, credential)
                  )}
              >
                Clear
              </Button>
            </div>
          ))}
        </div>
      )}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          act(async () => {
            await api.setCredential(project, name.trim(), value);
            setName("");
            setValue("");
          });
        }}
      >
        <InputGroup className="w-56">
          <InputField
            index={0}
            label="Name"
            labelHidden
            placeholder="JSR_TOKEN"
            value={name}
            onChange={setName}
          />
        </InputGroup>
        <InputGroup className="min-w-0 flex-1">
          <InputField
            index={0}
            label="Value"
            labelHidden
            type="password"
            autoComplete="off"
            placeholder="value"
            value={value}
            onChange={setValue}
          />
        </InputGroup>
        <Button
          type="submit"
          variant="secondary"
          leadingIcon={AddIcon}
          disabled={busy || !name.trim() || !value}
        >
          Set
        </Button>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
    </Panel>
  );
}
