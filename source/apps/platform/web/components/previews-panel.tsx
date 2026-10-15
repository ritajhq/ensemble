import { useState } from "react";
import { Badge, Button, InputField, InputGroup, useIcon } from "@ritaj/ui";
import { describe, type ProjectPreviews } from "../api.ts";
import { useApi } from "../api-provider.tsx";
import { go, runHash } from "../places.ts";
import { Notice } from "./notice.tsx";
import { Panel } from "./panel.tsx";

/** A project's previews: the webhook that keeps them in step with its branches, previewing one by hand, and those that are up. */
export function PreviewsPanel(
  { project, previews, onChanged }: {
    project: string;
    previews: ProjectPreviews;
    onChanged(): void;
  },
) {
  const api = useApi();
  const [branch, setBranch] = useState("");
  const [secret, setSecret] = useState("");
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
      <div className="grid gap-1 text-body">
        <span>
          GitHub webhook:{" "}
          <span className="font-mono text-caption">
            {location.origin}
            {previews.webhook.path}
          </span>{" "}
          (JSON; push and delete events)
        </span>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            act(async () => {
              await api.setWebhookSecret(project, secret);
              setSecret("");
            });
          }}
        >
          <Badge color={previews.webhook.secret ? "green" : "gray"}>
            {previews.webhook.secret ? "secret set" : "no secret yet"}
          </Badge>
          <InputGroup className="min-w-0 flex-1">
            <InputField
              index={0}
              label="Webhook secret"
              labelHidden
              type="password"
              autoComplete="off"
              placeholder="the same secret as on GitHub (16+ characters)"
              value={secret}
              onChange={setSecret}
            />
          </InputGroup>
          <Button
            type="submit"
            variant="secondary"
            disabled={busy || secret.length < 16}
          >
            Set
          </Button>
        </form>
      </div>

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
