import { useEffect, useState } from "react";
import { Badge, Button, useIcon } from "@ritaj/ui";
import {
  describe,
  type Manifest,
  type PreviewSettings,
  type Run,
  type Sync,
} from "../api.ts";
import { useApi } from "../api-provider.tsx";
import { CredentialsPanel } from "../components/credentials-panel.tsx";
import { Environments } from "../components/environments.tsx";
import { ReleasePanel } from "../components/release-panel.tsx";
import { PreviewSettingsForm } from "../components/preview-settings.tsx";
import { PreviewsPanel } from "../components/previews-panel.tsx";
import { Notice } from "../components/notice.tsx";
import { Panel } from "../components/panel.tsx";
import { RunBadge } from "../components/run-badge.tsx";
import { runHash } from "../places.ts";
import { detailsOf, titleOf } from "../run-title.ts";
import { useLoad } from "../use-load.ts";

/** How often a project is looked at again while it syncs. */
const SYNCING_POLL_MS = 2_000;

/** How each sync state reads. */
const SYNC_BADGES: Readonly<
  Record<Sync["state"], { label: string; color: "blue" | "green" | "red" }>
> = {
  syncing: { label: "Syncing", color: "blue" },
  synced: { label: "Synced", color: "green" },
  failed: { label: "Sync failed", color: "red" },
};

/** One project: where it comes from, how its last sync went, and the manifests it offers. */
export function ProjectScreen({ id }: { id: string }) {
  const api = useApi();
  const project = useLoad(() => api.project(id), [id]);
  const versions = useLoad(() => api.versions(id), [id]);
  const runs = useLoad(() => api.runs(id), [id]);
  const previews = useLoad(() => api.previews(id), [id]);
  const [error, setError] = useState<string | undefined>();
  const SyncIcon = useIcon("rotate-ccw");

  const syncing = project.value?.sync?.state === "syncing";
  useEffect(() => {
    if (!syncing) return;
    const timer = setTimeout(project.reload, SYNCING_POLL_MS);
    return () => clearTimeout(timer);
  }, [syncing, project.value]);

  async function sync() {
    setError(undefined);
    try {
      await api.sync(id);
      project.reload();
    } catch (e) {
      setError(describe(e));
    }
  }

  if (project.error) return <Notice tone="error">{project.error}</Notice>;
  const value = project.value;
  if (!value) return null;
  const { sync: last, catalog } = value;

  return (
    <>
      <Panel
        title={value.repository}
        description={`Manifests are read from ${value.ref}`}
        action={
          <Button
            variant="secondary"
            leadingIcon={SyncIcon}
            loading={syncing}
            disabled={syncing}
            onClick={sync}
          >
            Sync
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-body">
          {last && (
            <Badge color={SYNC_BADGES[last.state].color}>
              {SYNC_BADGES[last.state].label}
            </Badge>
          )}
          {last && (
            <span className="text-muted-foreground">
              {new Date(last.at).toLocaleString()}
            </span>
          )}
          {catalog && (
            <span className="font-mono text-caption">
              {catalog.commit.slice(0, 12)}
            </span>
          )}
        </div>
        {last?.state === "failed" && (
          <Notice tone="error" details={last.error}>
            The last sync failed
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {catalog && (
          <div className="flex flex-wrap items-center gap-2 text-body">
            <span className="text-muted-foreground">Deploy kits</span>
            {catalog.kits.map((kit) => (
              <Badge key={kit} color="gray">{kit}</Badge>
            ))}
          </div>
        )}
      </Panel>

      <ReleasePanel project={id} versions={versions.value ?? []} />
      <CredentialsPanel
        project={id}
        names={value.credentials}
        onChanged={project.reload}
      />
      {previews.value && (
        <PreviewsPanel
          project={id}
          previews={previews.value}
          onChanged={() => {
            previews.reload();
            runs.reload();
          }}
        />
      )}

      {catalog?.problems.map((problem) => (
        <Notice
          key={problem.manifest}
          tone="warning"
          details={problem.message}
        >
          ci/{problem.manifest} can't be read
        </Notice>
      ))}

      {catalog && catalog.manifests.length === 0 && (
        <Panel
          title="No delivery manifests"
          description="Nothing under ci/<name>/delivery.yml at this commit."
        />
      )}

      {catalog?.manifests.map((manifest) => (
        <ManifestPanel
          key={manifest.name}
          project={id}
          manifest={manifest}
          kits={catalog.kits}
          versions={versions.value ?? []}
          previewSettings={previews.value?.settings.find((settings) =>
            settings.manifest === manifest.name
          )}
          onChanged={() => {
            project.reload();
            previews.reload();
          }}
        />
      ))}

      <RunsPanel runs={runs.value ?? []} />
    </>
  );
}

/** The project's latest runs, newest first, each opening its own log. */
function RunsPanel({ runs }: { runs: readonly Run[] }) {
  return (
    <Panel
      title="Runs"
      description="Releases, deploys, plans and previews, newest first"
    >
      {runs.length === 0 && (
        <p className="text-body text-muted-foreground">Nothing run yet</p>
      )}
      {runs.length > 0 && (
        <div className="grid gap-1">
          {runs.map((run) => (
            <a
              key={run.id}
              href={runHash(run.id)}
              className="flex flex-wrap items-center gap-2 rounded-md px-2 py-1 text-body hover:bg-accent"
            >
              <RunBadge state={run.state} />
              <span className="font-medium">{titleOf(run.work)}</span>
              <span className="text-muted-foreground">
                {detailsOf(run.work).join(" · ")}
              </span>
              <span className="ml-auto text-caption text-muted-foreground">
                {new Date(run.queuedAt).toLocaleString()}
              </span>
            </a>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** One delivery manifest: what it releases, and what each of its environments supplies. */
function ManifestPanel(
  { project, manifest, kits, versions, previewSettings, onChanged }: {
    project: string;
    manifest: Manifest;
    kits: readonly string[];
    versions: readonly string[];
    previewSettings?: PreviewSettings;
    onChanged(): void;
  },
) {
  return (
    <Panel
      title={manifest.name}
      description={`ci/${manifest.name}/delivery.yml`}
    >
      <div className="flex flex-wrap items-center gap-2 text-body">
        <span className="text-muted-foreground">Ships</span>
        {manifest.ships.length === 0 && (
          <span className="text-muted-foreground">none</span>
        )}
        {manifest.ships.map((ship) => (
          <Badge key={ship} color="gray">{ship}</Badge>
        ))}
      </div>
      <Environments
        project={project}
        manifest={manifest}
        kits={kits}
        versions={versions}
        onChanged={onChanged}
      />
      {manifest.deployable && (
        <PreviewSettingsForm
          key={JSON.stringify(previewSettings ?? null)}
          project={project}
          manifest={manifest}
          kits={kits}
          settings={previewSettings}
          onChanged={onChanged}
        />
      )}
    </Panel>
  );
}
