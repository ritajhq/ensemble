import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useIcon,
} from "@ritaj/ui";
import { describe, type Manifest, type Sync } from "../api.ts";
import { useApi } from "../api-provider.tsx";
import { Notice } from "../components/notice.tsx";
import { Panel } from "../components/panel.tsx";
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
        <ManifestPanel key={manifest.name} manifest={manifest} />
      ))}
    </>
  );
}

/** One delivery manifest: what it releases, where it's deployed, and what each environment has to supply. */
function ManifestPanel({ manifest }: { manifest: Manifest }) {
  return (
    <Panel
      title={manifest.name}
      description={`ci/${manifest.name}/delivery.yml`}
    >
      <div className="flex flex-wrap items-center gap-2 text-body">
        <span className="text-muted-foreground">Environments</span>
        {manifest.environments.map((environment) => (
          <Badge key={environment.id} color="indigo">
            {environment.name}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-body">
        <span className="text-muted-foreground">Ships</span>
        {manifest.ships.length === 0 && (
          <span className="text-muted-foreground">none</span>
        )}
        {manifest.ships.map((ship) => (
          <Badge key={ship} color="gray">{ship}</Badge>
        ))}
      </div>
      {(manifest.variables.length > 0 || manifest.secrets.length > 0) && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Value</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Default</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {manifest.variables.map((variable, i) => (
              <TableRow key={`variable-${variable.name}`} index={i}>
                <TableCell className="font-mono text-caption">
                  {variable.name}
                </TableCell>
                <TableCell>
                  <Badge color="gray">
                    {variable.list ? "list variable" : "variable"}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-caption">
                  {variable.default ?? "—"}
                </TableCell>
              </TableRow>
            ))}
            {manifest.secrets.map((secret, i) => (
              <TableRow
                key={`secret-${secret}`}
                index={manifest.variables.length + i}
              >
                <TableCell className="font-mono text-caption">
                  {secret}
                </TableCell>
                <TableCell>
                  <Badge color="amber">secret</Badge>
                </TableCell>
                <TableCell>—</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
