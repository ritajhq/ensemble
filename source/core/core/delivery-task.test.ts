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
    provision: (request) => Promise.resolve({
      fragment: { category: request.category, name: request.name, content: {} },
      outputs: {},
    }),
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
  failing:
    run: exit 3
  bad-deployment-value:
    run: "true"
    arguments:
      where: \${deployment.nowhere}
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
): Promise<void> {
  return runDeliveryTask(
    "demo",
    "demo-kit",
    task,
    args,
    { artifacts: "local", version: "latest" },
    { findRepoRoot: () => Promise.resolve(repoRoot) },
    noReleasesGateway,
    new InProcessKitLoader(),
  );
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
      "Declared: record, inline, failing, bad-deployment-value.",
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
