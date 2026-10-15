import { assertEquals } from "@std/assert";
import { GithubWebhook } from "./github-webhook.ts";

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
  return new Request("http://x/webhook/portal", {
    method: "POST",
    body,
    headers: {
      "x-github-event": event,
      "x-hub-signature-256": `sha256=${hex}`,
    },
  });
}

const webhook = new GithubWebhook(SECRET, "ritajhq/portal");
const repository = { full_name: "ritajhq/portal" };

Deno.test("GithubWebhook reads a push to a branch", async () => {
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

Deno.test("GithubWebhook reads a branch deletion, as a push or as a delete event", async () => {
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

Deno.test("GithubWebhook refuses a bad signature and a payload for another repository", async () => {
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
  assertEquals(elsewhere.response.status, 403);
});

Deno.test("GithubWebhook ignores tags and other events", async () => {
  const tag = await webhook.interpret(
    await signed("push", { ref: "refs/tags/v1", repository }),
  );
  const other = await webhook.interpret(await signed("issues", {}));
  assertEquals(tag.event, undefined);
  assertEquals(other.event, undefined);
});
