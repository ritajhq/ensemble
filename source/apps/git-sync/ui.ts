import type { RepoTarget } from "./config.ts";

export interface SyncStatus {
  status: "ok" | "error";
  at: string;
  message?: string;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

function statusText(status: SyncStatus | undefined): string {
  if (!status) return "not synced yet";
  const label = status.status === "ok" ? "synced" : "failed";
  const detail = status.message ? ` — ${escapeHtml(status.message)}` : "";
  return `${label} at ${status.at}${detail}`;
}

/** A plain-HTML (no client JS) page listing every configured repo with a "Sync now" button —
 * fires the same sync a real webhook would, without needing one. See triggers.ts's manualAdapter. */
export function renderIndexPage(
  targets: readonly RepoTarget[],
  lastSync: ReadonlyMap<string, SyncStatus>,
): string {
  const rows = targets.map((target) => {
    const status = lastSync.get(target.id);
    return `
      <tr>
        <td>${escapeHtml(target.id)}</td>
        <td>${escapeHtml(target.repo)}@${escapeHtml(target.ref)}:${
      escapeHtml(target.path)
    }</td>
        <td>${escapeHtml(target.trigger)}</td>
        <td class="${status?.status === "error" ? "error" : ""}">${
      statusText(status)
    }</td>
        <td>
          <form method="post" action="/sync/${
      encodeURIComponent(target.id)
    }?redirect=1">
            <button type="submit">Sync now</button>
          </form>
        </td>
      </tr>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>git-sync</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem; color: #1a1a1a; }
      table { border-collapse: collapse; width: 100%; max-width: 72rem; }
      th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #e5e5e5; vertical-align: middle; }
      td.error { color: #b91c1c; }
      button { cursor: pointer; padding: 0.25rem 0.75rem; }
      form { margin: 0; }
    </style>
  </head>
  <body>
    <h1>git-sync</h1>
    <p>Fires each repo's sync directly — the same thing a real webhook triggers, without needing one.</p>
    <table>
      <thead><tr><th>Repo</th><th>Source</th><th>Trigger</th><th>Last sync</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body>
</html>
`;
}
