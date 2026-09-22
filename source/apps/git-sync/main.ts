import {
  parseRepoTargets,
  type RepoTarget,
  webhookSecretEnvVar,
} from "./config.ts";
import { verifySignature } from "./signature.ts";
import { syncRepo } from "./syncer.ts";
import { SyncQueue } from "./sync-queue.ts";

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

const queue = new SyncQueue(async (id) => {
  const target = targetsById.get(id);
  if (!target) return;
  console.log(
    `syncing ${target.repo}@${target.ref} -> ${destRoot}/${target.id}`,
  );
  await syncRepo(target, destRoot);
  console.log(`synced ${target.repo}@${target.ref}`);
});

Deno.serve({ port }, async (req) => {
  const { pathname } = new URL(req.url);
  const match = pathname.match(/^\/webhook\/([^/]+)$/);
  if (req.method !== "POST" || !match) {
    return new Response("Not found", { status: 404 });
  }

  const repoId = match[1];
  const target = targetsById.get(repoId);
  if (!target) return new Response("Unknown repo", { status: 404 });

  const secret = Deno.env.get(webhookSecretEnvVar(repoId));
  if (!secret) {
    console.error(`No webhook secret configured for "${repoId}"`);
    return new Response("Misconfigured", { status: 500 });
  }

  const rawBody = new Uint8Array(await req.arrayBuffer());
  const valid = await verifySignature(
    secret,
    rawBody,
    req.headers.get("x-hub-signature-256"),
  );
  if (!valid) return new Response("Invalid signature", { status: 401 });

  const event = req.headers.get("x-github-event");
  if (event === "ping") return new Response("pong");
  if (event !== "push") return new Response("Ignored event", { status: 202 });

  const payload = JSON.parse(new TextDecoder().decode(rawBody)) as {
    ref?: string;
  };
  if (payload.ref !== `refs/heads/${target.ref}`) {
    return new Response("Ignored ref", { status: 202 });
  }

  queue.trigger(repoId);
  return new Response("Accepted", { status: 202 });
});
