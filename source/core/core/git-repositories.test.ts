import { assertEquals } from "@std/assert";
import { type GitRepositoryRecord, GitRepositoryStore, type WorkflowGitLink, WorkflowGitLinkStore } from "./git-repositories.ts";

async function withRepositoryStore(fn: (store: GitRepositoryStore) => Promise<void>): Promise<void> {
  const kv = await Deno.openKv(":memory:");
  try {
    await fn(new GitRepositoryStore(kv));
  } finally {
    kv.close();
  }
}

async function withLinkStore(fn: (store: WorkflowGitLinkStore) => Promise<void>): Promise<void> {
  const kv = await Deno.openKv(":memory:");
  try {
    await fn(new WorkflowGitLinkStore(kv));
  } finally {
    kv.close();
  }
}

function makeRecord(overrides: Partial<GitRepositoryRecord> = {}): GitRepositoryRecord {
  return {
    projectName: "widgets",
    repoUrl: "https://example.com/acme/widgets.git",
    auth: { type: "none" },
    registeredAt: new Date().toISOString(),
    ...overrides,
  };
}

Deno.test("GitRepositoryStore: put then get round-trips a record", async () => {
  await withRepositoryStore(async (store) => {
    const record = makeRecord();
    await store.put(record);
    assertEquals(await store.get("widgets"), record);
  });
});

Deno.test("GitRepositoryStore: get returns undefined for an unregistered project", async () => {
  await withRepositoryStore(async (store) => {
    assertEquals(await store.get("nonexistent"), undefined);
  });
});

Deno.test("GitRepositoryStore: list returns every registered repository", async () => {
  await withRepositoryStore(async (store) => {
    await store.put(makeRecord({ projectName: "widgets" }));
    await store.put(makeRecord({ projectName: "gadgets" }));
    const all = await store.list();
    assertEquals(all.map((r) => r.projectName).sort(), ["gadgets", "widgets"]);
  });
});

Deno.test("GitRepositoryStore: delete removes a record", async () => {
  await withRepositoryStore(async (store) => {
    await store.put(makeRecord());
    await store.delete("widgets");
    assertEquals(await store.get("widgets"), undefined);
  });
});

Deno.test("GitRepositoryStore: put fully overwrites an existing record (e.g. on refresh)", async () => {
  await withRepositoryStore(async (store) => {
    await store.put(makeRecord({ lastFetchedAt: undefined }));
    await store.put(makeRecord({ lastFetchedAt: "2024-01-01T00:00:00.000Z" }));
    const record = await store.get("widgets");
    assertEquals(record?.lastFetchedAt, "2024-01-01T00:00:00.000Z");
  });
});

Deno.test("GitRepositoryStore: two instances against separate Deno.Kv connections don't see each other's data", async () => {
  const kvA = await Deno.openKv(":memory:");
  const kvB = await Deno.openKv(":memory:");
  try {
    const storeA = new GitRepositoryStore(kvA);
    const storeB = new GitRepositoryStore(kvB);
    await storeA.put(makeRecord({ projectName: "only-in-a" }));
    assertEquals(await storeB.get("only-in-a"), undefined);
  } finally {
    kvA.close();
    kvB.close();
  }
});

function makeLink(overrides: Partial<WorkflowGitLink> = {}): WorkflowGitLink {
  return {
    workflowName: "my-workflow",
    projectName: "widgets",
    pathInRepo: "deploy",
    syncedAt: new Date().toISOString(),
    ...overrides,
  };
}

Deno.test("WorkflowGitLinkStore: put then get round-trips a link", async () => {
  await withLinkStore(async (store) => {
    const link = makeLink();
    await store.put(link);
    assertEquals(await store.get("my-workflow"), link);
  });
});

Deno.test("WorkflowGitLinkStore: get returns undefined for an unlinked workflow", async () => {
  await withLinkStore(async (store) => {
    assertEquals(await store.get("nonexistent"), undefined);
  });
});

Deno.test("WorkflowGitLinkStore: delete removes a link", async () => {
  await withLinkStore(async (store) => {
    await store.put(makeLink());
    await store.delete("my-workflow");
    assertEquals(await store.get("my-workflow"), undefined);
  });
});

Deno.test("WorkflowGitLinkStore: listForProject filters by project", async () => {
  await withLinkStore(async (store) => {
    await store.put(makeLink({ workflowName: "a", projectName: "widgets" }));
    await store.put(makeLink({ workflowName: "b", projectName: "gadgets" }));
    const links = await store.listForProject("widgets");
    assertEquals(links.map((l) => l.workflowName), ["a"]);
  });
});

Deno.test("WorkflowGitLinkStore: listAll returns every link", async () => {
  await withLinkStore(async (store) => {
    await store.put(makeLink({ workflowName: "a", projectName: "widgets" }));
    await store.put(makeLink({ workflowName: "b", projectName: "gadgets" }));
    const links = await store.listAll();
    assertEquals(links.map((l) => l.workflowName).sort(), ["a", "b"]);
  });
});
