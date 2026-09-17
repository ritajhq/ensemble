import { fromFileUrl } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import { Deploy } from "@ensemble/core";
import { SubprocessKitLoader } from "./subprocess-kit-loader.ts";

const fixtureKitDir = fromFileUrl(
  new URL("./testdata/fixture-deploy-kit", import.meta.url),
);

/**
 * Exercises `SubprocessKitLoader` end to end — every call is a real, fresh
 * `deno run` subprocess against the fixture kit on disk, never an in-process
 * `import()`. This is exactly the mechanism that fixes the original bug (a
 * compiled `ens` binary can't do an in-process dynamic import of a kit it
 * only discovers at runtime); the specific claim that a *real* external
 * project's kit resolves its own dependencies correctly through this
 * mechanism (rather than silently borrowing ensemble's own local workspace
 * copy) was verified manually against a real vendored project during design,
 * not reproduced here — doing so deterministically in CI would need a real
 * published package at two different versions, which isn't safe/repeatable
 * to depend on. This fixture kit has no external dependencies at all, so
 * these tests focus on proving `SubprocessKitLoader`'s own plumbing (spawn,
 * the `$describe` capability handshake, provisioner indexing, config
 * layering) is correct.
 */
Deno.test("SubprocessKitLoader.load: provisioners() round-trips through real subprocess calls", async () => {
  const loader = new SubprocessKitLoader();
  const loaded = await loader.load(fixtureKitDir);

  const provisioners = await loaded.kit.provisioners();
  assertEquals(provisioners.length, 2);
  assertEquals(await provisioners[0].describe?.(), "widget-provisioner");
});

Deno.test("SubprocessKitLoader.load: a provisioner's optional describe()/provision() are correctly present or absent per-provisioner", async () => {
  const loader = new SubprocessKitLoader();
  const loaded = await loader.load(fixtureKitDir);
  const provisioners = await loaded.kit.provisioners();

  assertEquals(typeof provisioners[0].describe, "function");
  assertEquals(typeof provisioners[0].provision, "function");
  assertEquals(
    await provisioners[0].provision?.(
      { category: "compute", name: "api" } as never,
    ),
    {
      fragment: { category: "compute", name: "api", content: {} },
      outputs: {},
    },
  );

  assertEquals(provisioners[1].describe, undefined);
  assertEquals(provisioners[1].provision, undefined);
});

Deno.test("SubprocessKitLoader.load: a provisioner's matches() reflects the real kit's logic", async () => {
  const loader = new SubprocessKitLoader();
  const loaded = await loader.load(fixtureKitDir);
  const provisioners = await loaded.kit.provisioners();

  assertEquals(
    await provisioners[0].matches(
      { declaration: { type: "widget", params: {} } } as never,
    ),
    true,
  );
  assertEquals(
    await provisioners[0].matches(
      { declaration: { type: "other", params: {} } } as never,
    ),
    false,
  );
});

Deno.test("SubprocessKitLoader.load: realization() round-trips real, non-trivial data", async () => {
  const loader = new SubprocessKitLoader();
  const loaded = await loader.load(fixtureKitDir);
  const realization = await loaded.kit.realization();

  assertEquals(
    await realization.classPreset("databases", "relational", "critical"),
    { concernValues: { backupRetention: 35 } },
  );
  assertEquals(
    await realization.classPreset("databases", "relational", "standard"),
    undefined,
  );
  assertEquals(
    await realization.knowabilityOf("databases", "relational", "host"),
    "static",
  );
});

Deno.test("SubprocessKitLoader.load: present() reconstructs a real DependencyGraph's dependenciesOf() on the other side of the subprocess boundary", async () => {
  const loader = new SubprocessKitLoader();
  const loaded = await loader.load(fixtureKitDir);

  const workload = new Deploy.Manifest.Parser().parse(`
version: v1
deploy:
  compute:
    api:
      type: container-orchestrated
      image: nginx
      replicas: 1
      env: { DATABASE_URL: "\${databases.primary.url}" }
  databases:
    primary:
      type: relational
      engine: postgres
      version: "16"
      user: appuser
      database: appdb
      passwordSecret: db-password
`);
  const graph = new Deploy.Resolve.DependencyGraphBuilder().build(workload);

  const presented = await loaded.kit.present({ fragments: [] }, graph);
  const content = JSON.parse(presented.content);
  assertEquals(content.apiDependencies, [{
    category: "databases",
    name: "primary",
  }]);
});

Deno.test("SubprocessKitLoader.load: applyCommand()/watchCommand() round-trip real values", async () => {
  const loader = new SubprocessKitLoader();
  const loaded = await loader.load(fixtureKitDir);

  assertEquals(await loaded.kit.applyCommand("/tmp/x.yaml", "myapp"), [
    "fixture-apply",
    "/tmp/x.yaml",
    "myapp",
  ]);
  assertEquals(await loaded.kit.watchCommand?.("/tmp/x.yaml", "myapp"), [
    "fixture-watch",
    "/tmp/x.yaml",
    "myapp",
  ]);
});

Deno.test("SubprocessKitLoader.load: the $describe capability handshake correctly omits emulateExternals", async () => {
  const loader = new SubprocessKitLoader();
  const loaded = await loader.load(fixtureKitDir);

  assertEquals(typeof loaded.kit.watchCommand, "function");
  assertEquals(loaded.kit.emulateExternals, undefined);
});

Deno.test("SubprocessKitLoader.load: throws when the vendored dir has no main.ts", async () => {
  const loader = new SubprocessKitLoader();
  await assertRejects(
    () =>
      loader.load(
        fromFileUrl(new URL("./testdata/no-kit-here", import.meta.url)),
      ),
    Deploy.KitLoadError,
  );
});
