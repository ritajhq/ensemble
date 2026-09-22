import { type RepoTarget, webhookSecretEnvVar } from "./config.ts";
import { verifySignature } from "./signature.ts";

export interface TriggerResult {
  shouldSync: boolean;
  response: Response;
}

/** Authenticates/interprets one inbound request for `target`, deciding whether it should fire a sync. */
export interface TriggerAdapter {
  handle(req: Request, target: RepoTarget): Promise<TriggerResult>;
}

/** Verifies a GitHub push webhook (HMAC-signed via the repo's own secret) and only syncs on a push to `target.ref`. */
export const githubWebhookAdapter: TriggerAdapter = {
  async handle(req, target) {
    const secret = Deno.env.get(webhookSecretEnvVar(target.id));
    if (!secret) {
      console.error(`No webhook secret configured for "${target.id}"`);
      return {
        shouldSync: false,
        response: new Response("Misconfigured", { status: 500 }),
      };
    }

    const rawBody = new Uint8Array(await req.arrayBuffer());
    const valid = await verifySignature(
      secret,
      rawBody,
      req.headers.get("x-hub-signature-256"),
    );
    if (!valid) {
      return {
        shouldSync: false,
        response: new Response("Invalid signature", { status: 401 }),
      };
    }

    const event = req.headers.get("x-github-event");
    if (event === "ping") {
      return { shouldSync: false, response: new Response("pong") };
    }
    if (event !== "push") {
      return {
        shouldSync: false,
        response: new Response("Ignored event", { status: 202 }),
      };
    }

    const payload = JSON.parse(new TextDecoder().decode(rawBody)) as {
      ref?: string;
    };
    if (payload.ref !== `refs/heads/${target.ref}`) {
      return {
        shouldSync: false,
        response: new Response("Ignored ref", { status: 202 }),
      };
    }

    return {
      shouldSync: true,
      response: new Response("Accepted", { status: 202 }),
    };
  },
};

/**
 * An optional shared token that locks down the manual trigger and the `/` UI. Unset (the
 * default) leaves both open — fine for local dev, but worth setting via `envSecrets` before
 * this instance is reachable from outside a trusted network.
 */
export const SYNC_ADMIN_TOKEN_ENV_VAR = "SYNC_ADMIN_TOKEN";

function isAuthorized(req: Request): boolean {
  const token = Deno.env.get(SYNC_ADMIN_TOKEN_ENV_VAR);
  if (!token) return true;
  const url = new URL(req.url);
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      url.searchParams.get("token");
  return provided === token;
}

/**
 * No signature, no event filtering — always syncs once authorized. Backs both a repo
 * configured with `trigger: "manual"` and the always-available `/sync/<id>` escape hatch
 * (used regardless of a repo's configured trigger, for local testing and ad hoc resyncs).
 */
export const manualAdapter: TriggerAdapter = {
  handle(req, _target) {
    if (!isAuthorized(req)) {
      return Promise.resolve({
        shouldSync: false,
        response: new Response("Unauthorized", { status: 401 }),
      });
    }
    return Promise.resolve({
      shouldSync: true,
      response: new Response("Accepted", { status: 202 }),
    });
  },
};

export const TRIGGER_ADAPTERS: Record<RepoTarget["trigger"], TriggerAdapter> = {
  "github-webhook": githubWebhookAdapter,
  manual: manualAdapter,
};
