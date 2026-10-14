import { assertEquals } from "@std/assert";
import * as Platform from "@ensemble/platform";
import { Api } from "./api.ts";
import * as Kv from "./kv.ts";
import { Vault } from "./vault.ts";
import { Checkouts } from "./checkouts.ts";
import { Runner } from "./runner.ts";
import { Ensemble } from "./ensemble.ts";
import { Router } from "./router.ts";
import { RunFeed } from "./run-feed.ts";

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

async function withApi(
  run: (api: Api, stores: {
    catalogs: Kv.Catalogs;
    environments: Kv.Environments;
    values: Kv.Values;
  }) => Promise<void>,
): Promise<void> {
  const kv = await Deno.openKv(":memory:");
  try {
    const catalogs = new Kv.Catalogs(kv);
    const environments = new Kv.Environments(kv);
    const values = new Kv.Values(kv, await Vault.of(KEY));
    const runs = new Kv.Runs(kv);
    const credentials = new Kv.Credentials(kv, await Vault.of(KEY));
    const checkouts = new Checkouts(await Deno.makeTempDir());
    await run(
      new Api(
        new Kv.Projects(kv),
        catalogs,
        new Kv.Syncs(kv),
        environments,
        values,
        credentials,
        runs,
        checkouts,
        new RunFeed(
          runs,
          new Runner(
            new Kv.Projects(kv),
            environments,
            values,
            credentials,
            checkouts,
            new Ensemble("ens", { name: "t", email: "t@t" }),
          ),
        ),
        new Router(
          new Kv.Ingresses(kv),
          `${await Deno.makeTempDir()}/Caddyfile`,
        ),
      ),
      { catalogs, environments, values },
    );
  } finally {
    kv.close();
  }
}

function post(path: string, body: unknown): Request {
  return new Request(`http://platform.test${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function get(path: string): Request {
  return new Request(`http://platform.test${path}`);
}

Deno.test("Api: adding a project stores it and announces it, defaulting its ref to main", async () => {
  await withApi(async (api) => {
    const added: string[] = [];
    api.OnProjectAdded.Do((project) => added.push(project.id));

    const response = await api.handle(
      post("/api/projects", { id: "portal", repository: "ritajhq/portal" }),
    );

    assertEquals(response.status, 201);
    assertEquals(await response.json(), {
      id: "portal",
      repository: "ritajhq/portal",
      ref: "main",
    });
    assertEquals(added, ["portal"]);
    assertEquals(
      (await (await api.handle(get("/api/projects"))).json()).length,
      1,
    );
  });
});

Deno.test("Api: a project that can't be, or exists already, is refused and announces nothing", async () => {
  await withApi(async (api) => {
    const added: string[] = [];
    api.OnProjectAdded.Do((project) => added.push(project.id));
    const project = { id: "portal", repository: "ritajhq/portal" };

    await api.handle(post("/api/projects", project));
    const duplicate = await api.handle(post("/api/projects", project));
    const invalid = await api.handle(
      post("/api/projects", { id: "Portal", repository: "x" }),
    );

    assertEquals(duplicate.status, 409);
    assertEquals(invalid.status, 400);
    assertEquals(added, ["portal"]);
  });
});

Deno.test("Api: a project shows each manifest it offers with that manifest's environments", async () => {
  await withApi(async (api, { catalogs, environments }) => {
    await api.handle(
      post("/api/projects", { id: "portal", repository: "ritajhq/portal" }),
    );
    const manifest = new Platform.Manifest("web", ["web"], [], ["db"], true);
    await catalogs.save(
      "portal",
      new Platform.Catalog("abc123", [manifest], [], ["compose"]),
    );
    await environments.ensureFirst("portal", [manifest]);
    await environments.ensureFirst("portal", [manifest]);

    const body = await (await api.handle(get("/api/projects/portal"))).json();

    assertEquals(body.catalog.kits, ["compose"]);
    assertEquals(body.catalog.manifests[0].name, "web");
    assertEquals(body.catalog.manifests[0].secrets, ["db"]);
    assertEquals(
      body.catalog.manifests[0].environments.map((e: { name: string }) =>
        e.name
      ),
      ["production"],
    );
  });
});

Deno.test("Api: a sync is announced only for a project that exists", async () => {
  await withApi(async (api) => {
    const requested: string[] = [];
    api.OnSyncRequested.Do((project) => requested.push(project.id));
    await api.handle(
      post("/api/projects", { id: "portal", repository: "ritajhq/portal" }),
    );

    assertEquals(
      (await api.handle(post("/api/projects/portal/sync", {}))).status,
      202,
    );
    assertEquals(
      (await api.handle(post("/api/projects/nope/sync", {}))).status,
      404,
    );
    assertEquals(requested, ["portal"]);
  });
});

function put(path: string, body: unknown): Request {
  return new Request(`http://platform.test${path}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/** A project "portal" whose catalog offers one manifest "web", seeded with its first environment. */
async function withPortal(
  run: (
    api: Api,
    values: Kv.Values,
    environments: Kv.Environments,
  ) => Promise<void>,
): Promise<void> {
  await withApi(async (api, { catalogs, environments, values }) => {
    await api.handle(
      post("/api/projects", { id: "portal", repository: "ritajhq/portal" }),
    );
    const manifest = new Platform.Manifest(
      "web",
      ["web"],
      [{ name: "domain", list: false }],
      ["db-password"],
      true,
    );
    await catalogs.save(
      "portal",
      new Platform.Catalog("abc123", [manifest], [], ["compose"]),
    );
    await environments.ensureFirst("portal", [manifest]);
    await run(api, values, environments);
  });
}

const PRODUCTION = "/api/projects/portal/manifests/web/environments/production";

Deno.test("Api: an environment shows its variables, which secrets it holds but never their values, and what is still missing", async () => {
  await withPortal(async (api, values, environments) => {
    assertEquals(
      (await api.handle(
        put(`${PRODUCTION}/variables/domain`, { value: "ritaj.app" }),
      ))
        .status,
      204,
    );
    assertEquals(
      (await api.handle(
        put(`${PRODUCTION}/secrets/db-password`, { value: "hunter2" }),
      ))
        .status,
      204,
    );

    const text = await (await api.handle(get("/api/projects/portal"))).text();
    const [production] = JSON.parse(text).catalog.manifests[0].environments;
    assertEquals(production.variables, { domain: "ritaj.app" });
    assertEquals(production.secrets, ["db-password"]);
    assertEquals(production.missing, []);
    assertEquals(text.includes("hunter2"), false);

    const environment = await environments.get("portal", "web", "production");
    assertEquals(await values.reveal(environment!, "db-password"), "hunter2");
  });
});

Deno.test("Api: a value the manifest doesn't declare is refused", async () => {
  await withPortal(async (api) => {
    assertEquals(
      (await api.handle(put(`${PRODUCTION}/variables/nope`, { value: "x" })))
        .status,
      400,
    );
    assertEquals(
      (await api.handle(put(`${PRODUCTION}/secrets/domain`, { value: "x" })))
        .status,
      400,
    );
  });
});

Deno.test("Api: a cleared value is missing again", async () => {
  await withPortal(async (api) => {
    await api.handle(
      put(`${PRODUCTION}/variables/domain`, { value: "ritaj.app" }),
    );
    const cleared = await api.handle(
      new Request(`http://platform.test${PRODUCTION}/variables/domain`, {
        method: "DELETE",
      }),
    );
    assertEquals(cleared.status, 204);

    const body = await (await api.handle(get("/api/projects/portal"))).json();
    assertEquals(body.catalog.manifests[0].environments[0].missing, [
      "domain",
      "db-password",
    ]);
  });
});

Deno.test("Api: another environment is added once per name, and starts with nothing supplied", async () => {
  await withPortal(async (api) => {
    const path = "/api/projects/portal/manifests/web/environments";
    const added = await api.handle(post(path, { name: "staging" }));
    assertEquals(added.status, 201);
    assertEquals((await added.json()).missing, ["domain", "db-password"]);
    assertEquals(
      (await api.handle(post(path, { name: "staging" }))).status,
      409,
    );
    assertEquals(
      (await api.handle(post(path, { name: "Staging!" }))).status,
      400,
    );
    assertEquals(
      (await api.handle(
        post("/api/projects/portal/manifests/nope/environments", {
          name: "qa",
        }),
      ))
        .status,
      404,
    );
  });
});

Deno.test("Api: a deploy is queued for an environment with one of the project's kits, and announced", async () => {
  await withPortal(async (api) => {
    const requested: string[] = [];
    api.OnRunRequested.Do((run) => requested.push(run.id));

    const accepted = await api.handle(
      post(`${PRODUCTION}/deploys`, { kit: "compose", version: "1.0.0" }),
    );
    assertEquals(accepted.status, 202);
    const run = await accepted.json();
    assertEquals(run.state, "queued");
    assertEquals(run.work.termination, "apply");
    assertEquals(requested, [run.id]);

    const listed = await (await api.handle(get("/api/projects/portal/runs")))
      .json();
    assertEquals(listed.map((r: { id: string }) => r.id), [run.id]);
  });
});

Deno.test("Api: a deploy with a kit the project doesn't have, or that neither plans nor applies, is refused", async () => {
  await withPortal(async (api) => {
    assertEquals(
      (await api.handle(post(`${PRODUCTION}/deploys`, { kit: "aws" }))).status,
      400,
    );
    assertEquals(
      (await api.handle(
        post(`${PRODUCTION}/deploys`, { kit: "compose", termination: "nuke" }),
      )).status,
      400,
    );
  });
});

Deno.test("Api: a release of the project is queued and announced; one that can't be is refused", async () => {
  await withPortal(async (api) => {
    const requested: string[] = [];
    api.OnRunRequested.Do((run) => requested.push(run.work.kind));

    const accepted = await api.handle(
      post("/api/projects/portal/releases", {
        action: "next",
        argument: "minor",
      }),
    );
    assertEquals(accepted.status, 202);
    assertEquals((await accepted.json()).work, {
      kind: "release",
      project: "portal",
      action: "next",
      argument: "minor",
    });
    assertEquals(
      (await api.handle(
        post("/api/projects/portal/releases", {
          action: "next",
          argument: "huge",
        }),
      )).status,
      400,
    );
    assertEquals(requested, ["release"]);
  });
});

Deno.test("Api: a project shows the names of its release credentials, never their values", async () => {
  await withPortal(async (api) => {
    const set = await api.handle(
      put("/api/projects/portal/credentials/JSR_TOKEN", {
        value: "jsr-secret",
      }),
    );
    assertEquals(set.status, 204);
    assertEquals(
      (await api.handle(
        put("/api/projects/portal/credentials/jsr-token", { value: "x" }),
      )).status,
      400,
    );

    const text = await (await api.handle(get("/api/projects/portal"))).text();
    assertEquals(JSON.parse(text).credentials, ["JSR_TOKEN"]);
    assertEquals(text.includes("jsr-secret"), false);
  });
});
