import { useState } from "react";
import { Button, InputField, InputGroup, useIcon } from "@ritaj/ui";
import { describe, type ProjectPreviews } from "../api.ts";
import { useApi } from "../api-provider.tsx";
import { go, runHash } from "../places.ts";
import { Notice } from "./notice.tsx";
import { Panel } from "./panel.tsx";

/** A project's previews: previewing a branch by hand, and those that are up. The GitHub App's webhook keeps them in step with every push. */
export function PreviewsPanel(
  { project, previews, onChanged }: {
    project: string;
    previews: ProjectPreviews;
    onChanged(): void;
  },
) {
  const api = useApi();
  const [branch, setBranch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const PreviewIcon = useIcon("play");

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
      title="Previews"
      description="Each branch a manifest tracks is deployed beside its environments, at its own hosts, on every push; taken down when the branch is deleted."
    >
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          act(async () => {
            const [run] = await api.preview(project, branch.trim());
            if (run) go(runHash(run.id));
          });
        }}
      >
        <InputGroup className="min-w-0 max-w-sm flex-1">
          <InputField
            index={0}
            label="Branch"
            labelHidden
            placeholder="feat/login"
            value={branch}
            onChange={setBranch}
          />
        </InputGroup>
        <Button
          type="submit"
          leadingIcon={PreviewIcon}
          disabled={busy || !branch.trim()}
        >
          Preview a branch
        </Button>
      </form>

      {previews.live.length === 0 && (
        <p className="text-body text-muted-foreground">No preview is up</p>
      )}
      {previews.live.map((preview) => (
        <div
          key={`${preview.manifest} ${preview.branch}`}
          className="grid gap-1 rounded-md border border-border p-2"
        >
          <div className="flex flex-wrap items-center gap-2 text-body">
            <span className="font-medium">{preview.manifest}</span>
            <span className="text-muted-foreground">← {preview.branch}</span>
            <Button
              variant="ghost"
              className="ml-auto"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await api.takeDownPreview(project, preview.branch);
                })}
            >
              Take down
            </Button>
          </div>
          {preview.hosts.map((host) => (
            <a
              key={host}
              className="font-mono text-caption underline"
              href={`https://${host}`}
              target="_blank"
              rel="noreferrer"
            >
              {host}
            </a>
          ))}
        </div>
      ))}
      {error && <Notice tone="error">{error}</Notice>}
    </Panel>
  );
}
