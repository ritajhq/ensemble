import { basename, join } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import { runBuild, runPack } from "./pipeline.ts";
import type { Ports } from "./ports.ts";

interface Fixture {
  readonly repoRoot: string;
  readonly ports: Ports;
  readonly built: string[];
  readonly failing: Set<string>;
  /** What the `reporting` pack kit's `dependencies.ts` answers for each ship. */
  readonly answers: Map<string, unknown>;
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
    await Deno.mkdir(join(repoRoot, ".ensemble", "kits", "pack", "reporting"), {
      recursive: true,
    });
    for (const entry of ["main.ts", "dependencies.ts"]) {
      await Deno.writeTextFile(
        join(repoRoot, ".ensemble", "kits", "pack", "reporting", entry),
        "",
      );
    }
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
    const answers = new Map<string, unknown>();
    const ports = {
      repo: { findRepoRoot: () => Promise.resolve(repoRoot) },
      denoExe: { resolveDenoExecutable: () => Promise.resolve("/bin/deno") },
      process: {
        capture: (_command: string, args: readonly string[]) =>
          Promise.resolve(
            JSON.stringify(
              answers.get(basename(args[args.length - 1])) ?? { artifacts: [] },
            ),
          ),
        run: (_command: string, args: readonly string[]) => {
          const app = args[args.indexOf("--name") + 1];
          built.push(app);
          return Promise.resolve(failing.has(app) ? 1 : 0);
        },
      },
    } as unknown as Ports;
    await run({ repoRoot, ports, built, failing, answers });
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

const CHAINED = `build:
  a:
    kit: fake
  b:
    kit: fake
pack:
  web:
    kit: reporting
  shell:
    kit: fake
  dual:
    kit: reporting
  left:
    kit: reporting
  right:
    kit: reporting
`;

Deno.test("runPack: a pack the kit reports is packed first, after the builds it needs", async () => {
  await withProject(CHAINED, ["a", "b"], async (fixture) => {
    const { repoRoot, ports, built, answers } = fixture;
    await shipsFor(repoRoot, "web", "shell");
    answers.set("web", { artifacts: ["a"], packs: [{ ship: "shell" }] });

    assertEquals(await runPack("web", undefined, {}, ports), 0);

    assertEquals(built, ["a", "b", "shell", "web"]);
  });
});

Deno.test("runPack: a pack reported twice is packed once", async () => {
  await withProject(CHAINED, ["a", "b"], async (fixture) => {
    const { repoRoot, ports, built, answers } = fixture;
    await shipsFor(repoRoot, "web", "left", "shell");
    answers.set("web", {
      artifacts: [],
      packs: [{ ship: "shell" }, { ship: "left" }],
    });
    answers.set("left", { artifacts: [], packs: [{ ship: "shell" }] });

    await runPack("web", undefined, {}, ports);

    assertEquals(built, ["a", "b", "shell", "left", "web"]);
  });
});

Deno.test("runPack: one ship packed by two kits, the second reading the first's output", async () => {
  await withProject(CHAINED, ["a", "b"], async (fixture) => {
    const { repoRoot, ports, built, answers } = fixture;
    await shipsFor(repoRoot, "dual");
    answers.set("dual", {
      artifacts: [],
      packs: [{ ship: "dual", kit: "fake" }],
    });

    assertEquals(await runPack("dual", undefined, {}, ports), 0);

    assertEquals(built, ["a", "b", "dual", "dual"]);
  });
});

Deno.test("runPack: a failing pack it depends on stops it, with that code", async () => {
  await withProject(CHAINED, ["a", "b"], async (fixture) => {
    const { repoRoot, ports, built, failing, answers } = fixture;
    await shipsFor(repoRoot, "web", "shell");
    answers.set("web", { artifacts: [], packs: [{ ship: "shell" }] });
    failing.add("shell");

    assertEquals(await runPack("web", undefined, {}, ports), 1);

    assertEquals(built, ["a", "b", "shell"]);
  });
});

Deno.test("runPack: two packs that need each other are refused", async () => {
  await withProject(CHAINED, [], async (fixture) => {
    const { repoRoot, ports, built, answers } = fixture;
    await shipsFor(repoRoot, "left", "right");
    answers.set("left", { artifacts: [], packs: [{ ship: "right" }] });
    answers.set("right", { artifacts: [], packs: [{ ship: "left" }] });

    await assertRejects(
      () => runPack("left", undefined, {}, ports),
      Error,
      "depends on itself",
    );
    assertEquals(built, []);
  });
});

Deno.test("runPack: a reported pack with no ship says what to name", async () => {
  await withProject(CHAINED, [], async (fixture) => {
    const { repoRoot, ports, answers } = fixture;
    await shipsFor(repoRoot, "web");
    answers.set("web", { artifacts: [], packs: [{ kit: "fake" }] });

    await assertRejects(
      () => runPack("web", undefined, {}, ports),
      Error,
      "no `ship`",
    );
  });
});
