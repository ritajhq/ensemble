import { assertEquals, assertNotEquals } from "@std/assert";
import { join } from "@std/path";
import * as Deploy from "./deploy/index.ts";
import type { WorkloadContext } from "./deploy-context.ts";
import {
  DeploymentFingerprint,
  TaskSnapshotFile,
  TaskSnapshotRecorder,
} from "./task-snapshot.ts";

const workload: Deploy.Workload = {
  variables: { greeting: { default: "hi" } },
  compute: {
    web: {
      type: "container-orchestrated",
      params: { image: "web:latest", ports: { http: 8080 } },
    },
  } as never,
  databases: {
    db: { type: "relational", params: {} },
  } as never,
  tasks: {
    migrate: {
      script: "migrate.sh",
      arguments: {
        port: "${compute.web.http}",
        user: "${databases.db.user}",
        host: "${databases.db.host}",
        greeting: "${variables.greeting.value}",
        project: "${deployment.name}",
        literal: "plain",
      },
    },
  },
};

async function withKit(
  run: (context: WorkloadContext, kitDir: string) => Promise<void>,
): Promise<void> {
  const root = await Deno.makeTempDir();
  try {
    const kitDir = join(root, "kit");
    await Deno.mkdir(kitDir);
    await Deno.writeTextFile(join(kitDir, "main.ts"), "export default {};\n");
    await run({
      repoRoot: root,
      workload,
      registry: undefined as never,
      kitDir,
      kitConfigPath: join(root, "demo-kit.config.yml"),
    }, kitDir);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

Deno.test("DeploymentFingerprint: changes with the kit's files and the tasks' arguments, not with what running a kit leaves behind or how a task runs", async () => {
  await withKit(async (context, kitDir) => {
    const original = await DeploymentFingerprint.of(context);
    assertEquals(await DeploymentFingerprint.of(context), original);

    await Deno.writeTextFile(join(kitDir, "a1b2c3d4e5f6.ts"), "// wrapper");
    await Deno.writeTextFile(join(kitDir, "main.test.ts"), "// a test");
    assertEquals(await DeploymentFingerprint.of(context), original);

    const differentScript = {
      ...context,
      workload: {
        ...workload,
        tasks: { migrate: { ...workload.tasks!.migrate, script: "other.sh" } },
      },
    };
    assertEquals(await DeploymentFingerprint.of(differentScript), original);

    const differentArguments = {
      ...context,
      workload: {
        ...workload,
        tasks: { migrate: { script: "migrate.sh", arguments: { a: "b" } } },
      },
    };
    assertNotEquals(
      await DeploymentFingerprint.of(differentArguments),
      original,
    );

    await Deno.writeTextFile(join(context.kitConfigPath), "runtime: other\n");
    assertNotEquals(await DeploymentFingerprint.of(context), original);
    await Deno.remove(context.kitConfigPath);

    await Deno.writeTextFile(
      join(kitDir, "main.ts"),
      "export default {x:1};\n",
    );
    assertNotEquals(await DeploymentFingerprint.of(context), original);
  });
});

Deno.test("TaskSnapshotRecorder: keeps every task argument only a render answers, and nothing the manifest or the environment does", async () => {
  await withKit(async (context) => {
    const ledger = new Deploy.Render.OutputsLedger();
    ledger.record("compute", "web", "container-orchestrated", {}, {
      http: 8080,
    });
    ledger.record("databases", "db", "relational", {
      user: "admin",
      host: { "Fn::GetAtt": ["Db", "Endpoint"] },
    });
    const realization = {
      knowabilityOf: (_c: string, _t: string, output: string) =>
        Promise.resolve(output === "host" ? "dynamic" : "static"),
    } as unknown as Deploy.Realization;
    const renderer = new Deploy.Render.Renderer(
      new Deploy.Render.ReferenceResolver(realization),
      undefined as never,
      undefined as never,
    );
    const file = TaskSnapshotFile.for(context.repoRoot, "demo", "demo-kit");

    await new TaskSnapshotRecorder(file, "fp", renderer, workload).record(
      ledger,
      "/deployed/compose.yaml",
    );

    assertEquals(await file.read(), {
      version: 1,
      fingerprint: "fp",
      artifact: "/deployed/compose.yaml",
      // `host` is a target-deferred output — not a single value, not kept.
      arguments: { migrate: { port: 8080, user: "admin" } },
    });
  });
});
