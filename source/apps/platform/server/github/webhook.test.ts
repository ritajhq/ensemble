import { assertEquals } from "@std/assert";
import { App } from "./app.ts";
import type { Apps } from "./apps.ts";
import { Webhook } from "./webhook.ts";

const SECRET = "s3cret";

async function signed(
  event: string,
  payload: unknown,
  secret = SECRET,
): Promise<Request> {
  const body = JSON.stringify(payload);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  const hex = [...mac].map((byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  return new Request("http://x/hooks/github", {
    method: "POST",
    body,
    headers: {
      "x-github-event": event,
      "x-hub-signature-256": `sha256=${hex}`,
    },
  });
}

/** The app's store, holding an app whose webhook secret is `SECRET`. */
const apps = {
  get: () =>
    Promise.resolve(App.of({
      id: 1,
      slug: "ensemble-platform",
      owner: "ritajhq",
      htmlUrl: "https://github.com/apps/ensemble-platform",
      botId: 2,
      privateKey: "",
      webhookSecret: SECRET,
    })),
} as unknown as Apps;

const webhook = new Webhook(apps);
const repository = { full_name: "ritajhq/portal" };

Deno.test("Webhook reads a push to a branch", async () => {
  const { event, response } = await webhook.interpret(
    await signed("push", { ref: "refs/heads/feat/x", repository }),
  );
  assertEquals(response.status, 202);
  assertEquals(event, {
    kind: "pushed",
    repository: "ritajhq/portal",
    branch: "feat/x",
  });
});

Deno.test("Webhook reads a branch deletion, as a push or as a delete event", async () => {
  const push = await webhook.interpret(
    await signed("push", {
      ref: "refs/heads/feat/x",
      deleted: true,
      repository,
    }),
  );
  const deleted = await webhook.interpret(
    await signed("delete", { ref: "feat/x", ref_type: "branch", repository }),
  );
  assertEquals(push.event?.kind, "deleted");
  assertEquals(deleted.event, push.event);
});

Deno.test("Webhook refuses a bad signature, and names the repository a delivery came from", async () => {
  const forged = await webhook.interpret(
    await signed("push", { ref: "refs/heads/x", repository }, "other"),
  );
  assertEquals(forged.response.status, 401);
  assertEquals(forged.event, undefined);

  const elsewhere = await webhook.interpret(
    await signed("push", {
      ref: "refs/heads/x",
      repository: { full_name: "someone/else" },
    }),
  );
  assertEquals(elsewhere.event?.repository, "someone/else");
});

Deno.test("Webhook ignores tags and other events, and answers nothing without an app", async () => {
  const tag = await webhook.interpret(
    await signed("push", { ref: "refs/tags/v1", repository }),
  );
  const other = await webhook.interpret(await signed("issues", {}));
  assertEquals(tag.event, undefined);
  assertEquals(other.event, undefined);

  const none = new Webhook(
    { get: () => Promise.resolve(undefined) } as unknown as Apps,
  );
  const unset = await none.interpret(
    await signed("push", { ref: "refs/heads/x", repository }),
  );
  assertEquals(unset.response.status, 404);
});
