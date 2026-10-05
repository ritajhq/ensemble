import { assertEquals, assertRejects } from "@std/assert";
import { basename, join } from "@std/path";
import {
  runDeliveryTask,
  TaskArgumentError,
  TaskFailedError,
  UnknownTaskError,
} from "./delivery-task.ts";
import type { PackKitGateway } from "./deploy/kit/pack-kit-gateway.ts";
import { InProcessKitLoader } from "./deploy/kit/loader.ts";
import type { KitLoader } from "./deploy/kit/loader.ts";
import { loadWorkload } from "./deploy-context.ts";
import { DeploymentEnvironment, type EnvFile } from "./env-files.ts";
import {
  DeploymentFingerprint,
  type TaskSnapshot,
  TaskSnapshotFile,
} from "./task-snapshot.ts";
import type { RepoLocator } from "./ports.ts";

/** These workloads declare no releases, so the release locator resolver never asks the gateway anything. */
const noReleasesGateway: PackKitGateway = {
  describe: () => Promise.reject(new Error("no releases declared")),
  verify: () => Promise.reject(new Error("no releases declared")),
};

/**
 * A minimal kit written to disk, so the real `InProcessKitLoader` path
 * (`loadDeployContext`) is exercised rather than stubbed — the same "fakes only
 * at the true edges" discipline the worked-example test follows. It renders one
 * empty fragment per resource and presents a compose document.
 */
const KIT_SOURCE = `
export default {
  provisioners: () => Promise.resolve([{
    matches: () => Promise.resolve(true),
    provision: (request) => {
      globalThis.provisioned?.push(request.category + "." + request.name);
      return Promise.resolve({
        fragment: { category: request.category, name: request.name, content: {} },
        outputs: {},
      });
    },
  }]),
  realization: () => Promise.resolve({
    classPreset: () => Promise.resolve(undefined),
    defaultFor: () => Promise.resolve(undefined),
    boundFor: () => Promise.resolve(undefined),
    supportsCapability: () => Promise.resolve(false),
    knowabilityOf: () => Promise.resolve("static"),
  }),
  present: () => Promise.resolve({ filename: "compose.yaml", content: "services: {}\\n" }),
};
`;

const MANIFEST = `
version: v1
deploy:
  variables:
    greeting: { default: hi }
  compute:
    web:
      type: container-orchestrated
      image: web:latest
      replicas: 1
      ports:
        http: 8080
    worker:
      type: container-orchestrated
      image: worker:latest
      replicas: 1
tasks:
  record:
    script: record.sh
    arguments:
      project: \${deployment.name}
      artifact: \${deployment.artifact}
      root: \${deployment.root}
      web_port: \${compute.web.http}
      greeting: \${variables.greeting.value}
      literal: plain text
  inline:
    run: printf '%s\\n' "$project" > "$root/inline.txt"
    arguments:
      project: \${deployment.name}
      root: \${deployment.root}
  web-port:
    run: "true"
    arguments:
      web_port: \${compute.web.http}
  failing:
    run: exit 3
  bad-deployment-value:
    run: "true"
    arguments:
      where: \${deployment.nowhere}
  embedded:
    run: printf '%s\\n' "$url" > "$root/url.txt"
    arguments:
      root: \${deployment.root}
      url: https://\${variables.greeting.value}.example\${variables.greeting.value}/\${deployment.name}
  embedded-rendered:
    run: printf '%s\\n' "$url" > "$root/url.txt"
    arguments:
      root: \${deployment.root}
      url: http://web:\${compute.web.http}/health
`;

/** Writes a throwaway workspace: the manifest, its scripts folder, and the kit `loadDeployContext` will load. */
async function withWorkspace(
  run: (
    repoRoot: string,
    context: { repo: RepoLocator; loader: InProcessKitLoader },
  ) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir();
  try {
    const workloadDir = join(repoRoot, "ci", "demo");
    await Deno.mkdir(join(workloadDir, "scripts"), { recursive: true });
    await Deno.writeTextFile(join(workloadDir, "delivery.yml"), MANIFEST);
    await Deno.writeTextFile(
      join(workloadDir, "scripts", "record.sh"),
      `#!/bin/sh\nprintf '%s\\n' "$project" "$artifact" "$root" "$web_port" "$greeting" "$literal" "$1" "$2" > "$root/recorded.txt"\n`,
    );

    const kitDir = join(repoRoot, ".ensemble", "kits", "deploy", "demo-kit");
    await Deno.mkdir(kitDir, { recursive: true });
    await Deno.writeTextFile(join(kitDir, "main.ts"), KIT_SOURCE);

    await run(repoRoot, {
      repo: { findRepoRoot: () => Promise.resolve(repoRoot) },
      loader: new InProcessKitLoader(),
    });
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
}

function run1(
  repoRoot: string,
  task: string | undefined,
  args: readonly string[] = [],
  kitLoader: KitLoader = new InProcessKitLoader(),
  envFiles: readonly EnvFile[] = [],
): Promise<void> {
  return runDeliveryTask(
    "demo",
    "demo-kit",
    task,
    args,
    { artifacts: "local", version: "latest", envFiles },
    { findRepoRoot: () => Promise.resolve(repoRoot) },
    noReleasesGateway,
    kitLoader,
  );
}

/** A loader for runs that must not need the kit at all. */
const noKitLoader: KitLoader = {
  load: () => Promise.reject(new Error("the kit was loaded")),
};

/** Writes the snapshot a deploy of the workspace would leave, as the deploy of `fingerprint` (the current one unless given). */
async function writeSnapshot(
  repoRoot: string,
  snapshot: Omit<TaskSnapshot, "version" | "fingerprint">,
  fingerprint?: string,
): Promise<void> {
  const context = await loadWorkload("demo", "demo-kit", {
    findRepoRoot: () => Promise.resolve(repoRoot),
  }, { envFiles: [] });
  await TaskSnapshotFile.for(repoRoot, "demo", "demo-kit").write({
    version: 1,
    fingerprint: fingerprint ?? await DeploymentFingerprint.of(context),
    ...snapshot,
  });
}

Deno.test("runDeliveryTask: hands a script every declared argument as an environment variable, the deployment's own identity included", async () => {
  await withWorkspace(async (repoRoot) => {
    await run1(repoRoot, "record", ["first", "second"]);

    assertEquals(
      await Deno.readTextFile(join(repoRoot, "recorded.txt")),
      [
        // ${deployment.name} — the deployment's scoping name, not the bare workload name.
        `${basename(repoRoot)}-demo`,
        // ${deployment.artifact} — where the deploy writes the document, kit-owned filename included.
        join(repoRoot, "source", "artifacts", "deploy", "demo", "compose.yaml"),
        repoRoot,
        // ${compute.web.http} — a resource-port reference, baked straight off the manifest.
        "8080",
        // ${variables.greeting.value} — a declared variable, resolved like any resource field.
        "hi",
        "plain text",
        // Trailing command-line arguments, as $1..$n.
        "first",
        "second",
        "",
      ].join("\n"),
    );
  });
});

/** Runs `record` with `envFiles`, returning the greeting the script received. */
async function recordedGreeting(
  repoRoot: string,
  envFiles: readonly EnvFile[],
): Promise<string> {
  await Deno.writeTextFile(
    join(repoRoot, "ci", "demo", "dev.env"),
    "greeting=from-dev-env\n",
  );
  try {
    await run1(repoRoot, "record", [], undefined, envFiles);
  } finally {
    Deno.env.delete("GREETING");
  }
  const recorded = await Deno.readTextFile(join(repoRoot, "recorded.txt"));
  return recorded.split("\n")[4];
}

Deno.test("runDeliveryTask: an --env-file supplies values beneath the environment", async () => {
  await withWorkspace(async (repoRoot) => {
    assertEquals(
      await recordedGreeting(
        repoRoot,
        DeploymentEnvironment.required(["ci/demo/dev.env"]),
      ),
      "from-dev-env",
    );
  });
});

Deno.test("runDeliveryTask: without an --env-file, ci/<name>/dev.env is never read", async () => {
  await withWorkspace(async (repoRoot) => {
    assertEquals(await recordedGreeting(repoRoot, []), "hi");
  });
});

Deno.test("runDeliveryTask: an inline `run` gets the same treatment as a script", async () => {
  await withWorkspace(async (repoRoot) => {
    await run1(repoRoot, "inline");

    assertEquals(
      await Deno.readTextFile(join(repoRoot, "inline.txt")),
      `${basename(repoRoot)}-demo\n`,
    );
  });
});

Deno.test("runDeliveryTask: naming no task lists what the workload declares instead of running anything", async () => {
  await withWorkspace(async (repoRoot) => {
    await run1(repoRoot, undefined);
    assertEquals(
      await Deno.stat(join(repoRoot, "recorded.txt")).then(
        () => true,
        () => false,
      ),
      false,
    );
  });
});

Deno.test("runDeliveryTask: an undeclared task name fails naming the ones that are declared", async () => {
  await withWorkspace(async (repoRoot) => {
    await assertRejects(
      () => run1(repoRoot, "nope"),
      UnknownTaskError,
      "Declared: record, inline, web-port, failing, bad-deployment-value, embedded, embedded-rendered.",
    );
  });
});

Deno.test("runDeliveryTask: a task process that exits non-zero fails its own invocation, with the exit code", async () => {
  await withWorkspace(async (repoRoot) => {
    await assertRejects(
      () => run1(repoRoot, "failing"),
      TaskFailedError,
      "exited with code 3",
    );
  });
});

Deno.test("runDeliveryTask: an unknown ${deployment.*} name fails naming the whole set", async () => {
  await withWorkspace(async (repoRoot) => {
    await assertRejects(
      () => run1(repoRoot, "bad-deployment-value"),
      TaskArgumentError,
      "the deployment namespace has only ${deployment.name}, ${deployment.artifact}, ${deployment.root}.",
    );
  });
});

/** What the kit provisioned while `run` ran, in order. */
async function provisionedDuring(run: () => Promise<void>): Promise<string[]> {
  const provisioned: string[] = [];
  (globalThis as { provisioned?: string[] }).provisioned = provisioned;
  try {
    await run();
  } finally {
    delete (globalThis as { provisioned?: string[] }).provisioned;
  }
  return provisioned;
}

Deno.test("runDeliveryTask: renders only the resources a task's arguments reference", async () => {
  await withWorkspace(async (repoRoot) => {
    assertEquals(
      await provisionedDuring(() => run1(repoRoot, "web-port")),
      ["compute.web"],
    );
  });
});

Deno.test("runDeliveryTask: a task referencing no resource renders nothing", async () => {
  await withWorkspace(async (repoRoot) => {
    assertEquals(
      await provisionedDuring(() => run1(repoRoot, "inline")),
      [],
    );
  });
});

Deno.test("runDeliveryTask: a task referencing the artifact renders the whole workload, the artifact being that render", async () => {
  await withWorkspace(async (repoRoot) => {
    assertEquals(
      (await provisionedDuring(() => run1(repoRoot, "record"))).sort(),
      ["compute.web", "compute.worker"],
    );
  });
});

Deno.test("runDeliveryTask: with the last deploy's snapshot, resolves what only a render could from it, without loading the kit", async () => {
  await withWorkspace(async (repoRoot) => {
    await writeSnapshot(repoRoot, {
      artifact: "/deployed/compose.yaml",
      arguments: { record: { web_port: 9999 } },
    });

    await run1(repoRoot, "record", [], noKitLoader);

    assertEquals(
      await Deno.readTextFile(join(repoRoot, "recorded.txt")),
      [
        `${basename(repoRoot)}-demo`,
        "/deployed/compose.yaml",
        repoRoot,
        "9999",
        "hi",
        "plain text",
        "",
        "",
        "",
      ].join("\n"),
    );
  });
});

Deno.test("runDeliveryTask: a snapshot from before the manifest or kit changed is not used", async () => {
  await withWorkspace(async (repoRoot) => {
    await writeSnapshot(repoRoot, {
      artifact: "/deployed/compose.yaml",
      arguments: { record: { web_port: 9999 } },
    }, "an older deploy");

    await run1(repoRoot, "record");

    const recorded = (await Deno.readTextFile(join(repoRoot, "recorded.txt")))
      .split("\n");
    assertEquals(recorded[3], "8080");
  });
});

Deno.test("runDeliveryTask: a snapshot missing one of a task's rendered arguments is not used", async () => {
  await withWorkspace(async (repoRoot) => {
    await writeSnapshot(repoRoot, {
      artifact: "/deployed/compose.yaml",
      arguments: {},
    });

    await run1(repoRoot, "record");

    const recorded = (await Deno.readTextFile(join(repoRoot, "recorded.txt")))
      .split("\n");
    assertEquals(recorded[3], "8080");
  });
});

Deno.test("runDeliveryTask: with a snapshot, references embedded in a larger string are interpolated, not passed through as text", async () => {
  await withWorkspace(async (repoRoot) => {
    await writeSnapshot(repoRoot, {
      artifact: "/deployed/compose.yaml",
      arguments: {},
    });

    await run1(repoRoot, "embedded", [], noKitLoader);

    assertEquals(
      await Deno.readTextFile(join(repoRoot, "url.txt")),
      `https://hi.examplehi/${basename(repoRoot)}-demo\n`,
    );
  });
});

Deno.test("runDeliveryTask: a snapshot is not used for an argument embedding a reference only a render can answer", async () => {
  await withWorkspace(async (repoRoot) => {
    await writeSnapshot(repoRoot, {
      artifact: "/deployed/compose.yaml",
      arguments: {},
    });

    await run1(repoRoot, "embedded-rendered");

    assertEquals(
      await Deno.readTextFile(join(repoRoot, "url.txt")),
      "http://web:8080/health\n",
    );
  });
});
