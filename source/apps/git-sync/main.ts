import { parseRepoTargets, type RepoTarget } from "./config.ts";
import { manualAdapter, TRIGGER_ADAPTERS } from "./triggers.ts";
import { syncRepo } from "./syncer.ts";
import { SyncQueue } from "./sync-queue.ts";
import { renderIndexPage, type SyncStatus } from "./ui.ts";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var "${name}"`);
  return value;
}

const destRoot = Deno.env.get("SYNC_DEST") ?? "/data";
const port = Number(Deno.env.get("PORT") ?? 8080);

const targets = parseRepoTargets(requireEnv("REPOS"));
const targetsById = new Map<string, RepoTarget>(
  targets.map((target) => [target.id, target]),
);

const lastSync = new Map<string, SyncStatus>();

const queue = new SyncQueue(async (id) => {
  const target = targetsById.get(id);
  if (!target) return;
  console.log(
    `syncing ${target.repo}@${target.ref} -> ${destRoot}/${target.id}`,
  );
  try {
    await syncRepo(target, destRoot);
    lastSync.set(id, { status: "ok", at: new Date().toISOString() });
    console.log(`synced ${target.repo}@${target.ref}`);
  } catch (error) {
    lastSync.set(id, {
      status: "error",
      at: new Date().toISOString(),
      message: String(error),
    });
    throw error;
  }
});

async function handleTrigger(
  repoId: string,
  req: Request,
  useManual: boolean,
): Promise<Response> {
  const target = targetsById.get(repoId);
  if (!target) return new Response("Unknown repo", { status: 404 });

  const adapter = useManual ? manualAdapter : TRIGGER_ADAPTERS[target.trigger];
  const { shouldSync, response } = await adapter.handle(req, target);
  if (shouldSync) queue.trigger(repoId);
  return response;
}

Deno.serve({ port }, async (req) => {
  const url = new URL(req.url);
  const { pathname } = url;

  if (req.method === "GET" && pathname === "/") {
    return new Response(renderIndexPage(targets, lastSync), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // The repo's own configured trigger (github-webhook by default) — the shape a real
  // webhook sender posts to.
  const webhookMatch = pathname.match(/^\/webhook\/([^/]+)$/);
  if (req.method === "POST" && webhookMatch) {
    return await handleTrigger(webhookMatch[1], req, false);
  }

  // Always-available manual trigger (the `/` UI's buttons post here) — regardless of a
  // repo's configured trigger, for local testing and ad hoc resyncs.
  const syncMatch = pathname.match(/^\/sync\/([^/]+)$/);
  if (req.method === "POST" && syncMatch) {
    const response = await handleTrigger(syncMatch[1], req, true);
    if (url.searchParams.get("redirect") === "1") {
      return new Response(null, { status: 303, headers: { location: "/" } });
    }
    return response;
  }

  return new Response("Not found", { status: 404 });
});
