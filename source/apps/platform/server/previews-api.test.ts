import { assertEquals } from "@std/assert";
import * as Platform from "@ensemble/platform";
import { Endpoints } from "./endpoints.ts";
import * as Kv from "./kv.ts";
import { Previews } from "./previews.ts";
import { PreviewsApi } from "./previews-api.ts";
import { Vault } from "./vault.ts";

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const WEBHOOK_SECRET = "a-webhook-secret-long-enough";

interface Fixture {
  readonly answer: (request: Request) => Promise<Response>;
  /** What each queued run carries, as `<intent> <manifest> <branch>`. */
  readonly queued: string[];
  readonly live: Kv.LivePreviews;
}

/** A project "portal" offering one deployable manifest "portal", with its production environment and a "preview" one beside it. */
async function withPortal(run: (fixture: Fixture) => Promise<void>) {
  const kv = await Deno.openKv(":memory:");
  try {
    const projects = new Kv.Projects(kv);
    const catalogs = new Kv.Catalogs(kv);
    const environments = new Kv.Environments(kv);
    const live = new Kv.LivePreviews(kv);
    const settings = new Kv.PreviewSettings(kv);
    const previews = new Previews(settings, live, new Kv.Runs(kv));
    const endpoints = new Endpoints();
    new PreviewsApi(
      projects,
      catalogs,
      environments,
      settings,
      live,
      new Kv.WebhookSecrets(kv, await Vault.of(KEY)),
      previews,
      endpoints,
    );

    await projects.add(
      Platform.Project.create({
        id: "portal",
        repository: "ritajhq/portal",
        ref: "main",
      }),
    );
    const manifest = new Platform.Manifest(
      "portal",
      ["portal"],
      [{ name: "domain", list: false }, {
        name: "dashboard_origin",
        list: false,
      }],
      [],
      true,
    );
    await catalogs.save(
      "portal",
      new Platform.Catalog("abc", [manifest], [], ["compose"]),
    );
    await environments.ensureFirst("portal", [manifest]);
    await environments.add(
      Platform.Environment.create("portal", "portal", "preview"),
    );

    const queued: string[] = [];
    previews.OnRunRequested.Do(({ work }) => {
      const change = work as Platform.PreviewChange;
      queued.push(`${change.intent} ${change.manifest} ${change.branch}`);
    });
    await run({ answer: (request) => endpoints.answer(request), queued, live });
  } finally {
    kv.close();
  }
}

function request(method: string, path: string, body?: unknown): Request {
  return new Request(`http://platform.test${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const SETTINGS = "/api/projects/portal/manifests/portal/previews";
const SETUP = {
  branches: ["feat/*"],
  base: "preview",
  kit: "compose",
  overrides: {
    domain: "{internal}",
    dashboard_origin: "https://{host:dashboard}",
  },
};

Deno.test("PreviewsApi: a manifest is previewed from a non-production environment, with overrides it declares and a kit the project has", async () => {
  await withPortal(async ({ answer }) => {
    assertEquals(
      (await answer(request("PUT", SETTINGS, { ...SETUP, base: "production" })))
        .status,
      400,
    );
    assertEquals(
      (await answer(
        request("PUT", SETTINGS, { ...SETUP, overrides: { nope: "{slug}" } }),
      )).status,
      400,
    );
    assertEquals(
      (await answer(request("PUT", SETTINGS, { ...SETUP, kit: "aws" })))
        .status,
      400,
    );
    assertEquals((await answer(request("PUT", SETTINGS, SETUP))).status, 204);

    const shown = await (await answer(
      request("GET", "/api/projects/portal/previews"),
    )).json();
    assertEquals(shown.settings[0].base, "preview");
    assertEquals(shown.webhook, {
      path: "/hooks/github/portal",
      secret: false,
    });
  });
});

Deno.test("PreviewsApi: a branch previewed by hand is deployed for every manifest tracking it, and only those", async () => {
  await withPortal(async ({ answer, queued }) => {
    await answer(request("PUT", SETTINGS, SETUP));

    const untracked = await answer(
      request("POST", "/api/projects/portal/previews", { branch: "main" }),
    );
    assertEquals(untracked.status, 400);

    const tracked = await answer(
      request("POST", "/api/projects/portal/previews", {
        branch: "feat/login",
      }),
    );
    assertEquals(tracked.status, 202);
    assertEquals(queued, ["deploy portal feat/login"]);
  });
});

Deno.test("PreviewsApi: a deleted branch takes down each of its previews that is up, with the kit it came up with", async () => {
  await withPortal(async ({ answer, queued, live }) => {
    await live.up({
      project: "portal",
      manifest: "portal",
      branch: "feat/login",
      kit: "compose",
      hosts: [],
    });
    const response = await answer(
      request("POST", "/api/projects/portal/previews/destroy", {
        branch: "feat/login",
      }),
    );
    assertEquals(response.status, 202);
    assertEquals(queued, ["destroy portal feat/login"]);
  });
});

Deno.test("PreviewsApi: GitHub's push is acted on once signed with the project's own secret", async () => {
  await withPortal(async ({ answer, queued }) => {
    await answer(request("PUT", SETTINGS, SETUP));
    const push = (secret: string) =>
      signed("push", {
        ref: "refs/heads/feat/login",
        repository: { full_name: "ritajhq/portal" },
      }, secret);

    assertEquals(
      (await answer(await push(WEBHOOK_SECRET))).status,
      404,
    );
    assertEquals(
      (await answer(
        request("PUT", "/api/projects/portal/webhook-secret", {
          value: WEBHOOK_SECRET,
        }),
      )).status,
      204,
    );
    assertEquals(
      (await answer(await push("someone-elses-secret"))).status,
      401,
    );
    assertEquals(queued, []);
    assertEquals((await answer(await push(WEBHOOK_SECRET))).status, 202);
    assertEquals(queued, ["deploy portal feat/login"]);
  });
});

async function signed(
  event: string,
  payload: unknown,
  secret: string,
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
  const hex = [...mac].map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return new Request("http://platform.test/hooks/github/portal", {
    method: "POST",
    body,
    headers: {
      "x-github-event": event,
      "x-hub-signature-256": `sha256=${hex}`,
    },
  });
}
