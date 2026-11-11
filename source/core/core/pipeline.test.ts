import { join } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import { runBuild, runPack } from "./pipeline.ts";
import type { Ports } from "./ports.ts";

interface Fixture {
  readonly repoRoot: string;
  readonly ports: Ports;
  readonly built: string[];
  readonly failing: Set<string>;
}

async function withProject(
  config: string,
  apps: readonly string[],
  run: (fixture: Fixture) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-pipeline-test-",
  });
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble", "kits", "build", "fake"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(repoRoot, ".ensemble", "kits", "build", "fake", "main.ts"),
      "",
    );
    await Deno.mkdir(join(repoRoot, ".ensemble", "kits", "pack", "fake"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(repoRoot, ".ensemble", "kits", "pack", "fake", "main.ts"),
      "",
    );
    await Deno.writeTextFile(
      join(repoRoot, ".ensemble", "config.yaml"),
      config,
    );
    for (const app of apps) {
      await Deno.mkdir(join(repoRoot, "source", "apps", app), {
        recursive: true,
      });
    }
    const built: string[] = [];
    const failing = new Set<string>();
    const ports = {
      repo: { findRepoRoot: () => Promise.resolve(repoRoot) },
      denoExe: { resolveDenoExecutable: () => Promise.resolve("/bin/deno") },
      process: {
        run: (_command: string, args: readonly string[]) => {
          const app = args[args.indexOf("--name") + 1];
          built.push(app);
          return Promise.resolve(failing.has(app) ? 1 : 0);
        },
      },
    } as unknown as Ports;
    await run({ repoRoot, ports, built, failing });
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
}

const PROJECT = `build:
  a:
    kit: fake
  b:
    kit: fake
pack:
  plain:
    kit: fake
`;
const OPTIONS = { mode: "development", watch: false } as const;

async function shipsFor(repoRoot: string, ...ships: string[]) {
  for (const ship of ships) {
    await Deno.mkdir(join(repoRoot, "source", "ship", ship), {
      recursive: true,
    });
  }
}

Deno.test("runBuild: an app already built in a shared set isn't built again", async () => {
  await withProject(PROJECT, ["a", "b"], async ({ ports, built }) => {
    const shared = new Set<string>();

    await runBuild("a", { ...OPTIONS, done: shared }, ports);
    await runBuild("a", { ...OPTIONS, done: shared }, ports);
    await runBuild("b", { ...OPTIONS, done: shared }, ports);

    assertEquals(built, ["a", "b"]);
  });
});

Deno.test("runBuild: a failing build gives its code", async () => {
  await withProject(PROJECT, ["a"], async ({ ports, failing }) => {
    failing.add("a");
    assertEquals(await runBuild("a", OPTIONS, ports), 1);
  });
});

Deno.test("runPack: a pack with no kit given or declared says where to name one", async () => {
  await withProject(PROJECT, [], async ({ repoRoot, ports }) => {
    await shipsFor(repoRoot, "unknown");

    await assertRejects(
      () => runPack("unknown", undefined, {}, ports),
      Error,
      "pack.unknown.kit",
    );
  });
});

Deno.test("runPack: a ship whose kit doesn't say what it depends on builds every app first", async () => {
  await withProject(PROJECT, ["a", "b"], async ({ repoRoot, ports, built }) => {
    await shipsFor(repoRoot, "plain");

    await runPack("plain", undefined, {}, ports);

    assertEquals(built, ["a", "b", "plain"]);
  });
});

Deno.test("runPack: an app something else keeps built is not built again", async () => {
  await withProject(PROJECT, ["a", "b"], async ({ repoRoot, ports, built }) => {
    await shipsFor(repoRoot, "plain");

    await runPack(
      "plain",
      undefined,
      { skipBuildingApps: new Set(["a"]) },
      ports,
    );

    assertEquals(built, ["b", "plain"]);
  });
});

Deno.test("a config that still has needs is refused, with what to do instead", async () => {
  await withProject(
    `build:
  a:
    kit: fake
    needs:
      - b
`,
    ["a"],
    async ({ ports, built }) => {
      await assertRejects(
        () => runBuild("a", OPTIONS, ports),
        Error,
        "build.a.needs is no longer supported",
      );
      assertEquals(built, []);
    },
  );
});
