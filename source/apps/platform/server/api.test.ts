import { assertEquals } from "@std/assert";
import * as Platform from "@ensemble/platform";
import { Api } from "./api.ts";
import * as Kv from "./kv.ts";

async function withApi(
  run: (api: Api, stores: {
    catalogs: Kv.Catalogs;
    environments: Kv.Environments;
  }) => Promise<void>,
): Promise<void> {
  const kv = await Deno.openKv(":memory:");
  try {
    const catalogs = new Kv.Catalogs(kv);
    const environments = new Kv.Environments(kv);
    await run(
      new Api(new Kv.Projects(kv), catalogs, new Kv.Syncs(kv), environments),
      { catalogs, environments },
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
    const manifest = new Platform.Manifest("web", ["web"], [], ["db"]);
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
