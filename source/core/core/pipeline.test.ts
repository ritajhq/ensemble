import { join } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import { runBuild, runPack } from "./pipeline.ts";
import type { Ports } from "./ports.ts";

interface Fixture {
  readonly repoRoot: string;
  readonly ports: Ports;
  readonly built: string[];
  /** Each step's `--needs`, by app or ship. */
  readonly needs: Record<string, unknown>;
  readonly failing: Set<string>;
}

async function withProject(
  config: string,
  apps: readonly string[],
  run: (fixture: Fixture) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir({ prefix: "ensemble-needs-test-" });
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
    const needs: Record<string, unknown> = {};
    const failing = new Set<string>();
    const ports = {
      repo: { findRepoRoot: () => Promise.resolve(repoRoot) },
      denoExe: { resolveDenoExecutable: () => Promise.resolve("/bin/deno") },
      process: {
        run: (_command: string, args: readonly string[]) => {
          const app = args[args.indexOf("--name") + 1];
          built.push(app);
          const flag = args.indexOf("--needs");
          if (flag !== -1) needs[app] = JSON.parse(args[flag + 1]);
          return Promise.resolve(failing.has(app) ? 1 : 0);
        },
      },
    } as unknown as Ports;
    await run({ repoRoot, ports, built, needs, failing });
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
}

const CHAIN = `build:
  web:
    kit: fake
  shell:
    kit: fake
    needs:
      - web
  installer:
    kit: fake
    needs:
      - shell
      - web
`;
const OPTIONS = { mode: "development", watch: false } as const;

Deno.test("runBuild: what an app needs is built first, deepest first, each once", async () => {
  await withProject(
    CHAIN,
    ["web", "shell", "installer"],
    async ({ ports, built }) => {
      const code = await runBuild("installer", OPTIONS, ports);

      assertEquals(code, 0);
      assertEquals(built, ["web", "shell", "installer"]);
    },
  );
});

Deno.test("runBuild: a failing need stops the build, with its code", async () => {
  await withProject(
    CHAIN,
    ["web", "shell", "installer"],
    async ({ ports, built, failing }) => {
      failing.add("web");

      assertEquals(await runBuild("shell", OPTIONS, ports), 1);
      assertEquals(built, ["web"]);
    },
  );
});

Deno.test("runBuild: an app already built in a shared set isn't built again", async () => {
  await withProject(CHAIN, ["web", "shell"], async ({ ports, built }) => {
    const shared = new Set<string>();

    await runBuild("web", { ...OPTIONS, done: shared }, ports);
    await runBuild("shell", { ...OPTIONS, done: shared }, ports);

    assertEquals(built, ["web", "shell"]);
  });
});

Deno.test("runBuild: needs forming a cycle are refused", async () => {
  await withProject(
    `build:
  a:
    kit: fake
    needs:
      - b
  b:
    kit: fake
    needs:
      - a
`,
    ["a", "b"],
    async ({ ports }) => {
      await assertRejects(
        () => runBuild("a", OPTIONS, ports),
        Error,
        "cycle: build a -> build b -> build a",
      );
    },
  );
});

const ACROSS_STEPS = `build:
  cli:
    kit: fake
  web:
    kit: fake
  shell:
    kit: fake
    needs:
      - web
      - pack: tool
pack:
  tool:
    kit: fake
    needs:
      - build: cli
  downloads:
    kit: fake
    needs:
      - pack: tool
      - build: shell
`;

async function shipsFor(repoRoot: string, ...ships: string[]) {
  for (const ship of ships) {
    await Deno.mkdir(join(repoRoot, "source", "ship", ship), {
      recursive: true,
    });
  }
}

Deno.test("runBuild: a build can need a pack, which runs first with its own needs", async () => {
  await withProject(
    ACROSS_STEPS,
    ["cli", "web", "shell"],
    async ({ repoRoot, ports, built, needs }) => {
      await shipsFor(repoRoot, "tool");

      assertEquals(await runBuild("shell", OPTIONS, ports), 0);

      assertEquals(built, ["web", "cli", "tool", "shell"]);
      assertEquals(needs["shell"], [
        {
          kind: "build",
          name: "web",
          output: join(repoRoot, "source/artifacts/web"),
        },
        {
          kind: "pack",
          name: "tool",
          output: join(repoRoot, "source/artifacts/packages"),
        },
      ]);
    },
  );
});

Deno.test("runPack: a pack can need packs and builds, with its kit from config.yaml, each step once", async () => {
  await withProject(
    ACROSS_STEPS,
    ["cli", "web", "shell"],
    async ({ repoRoot, ports, built }) => {
      await shipsFor(repoRoot, "tool", "downloads");

      assertEquals(await runPack("downloads", undefined, {}, ports), 0);

      assertEquals(built, ["cli", "tool", "web", "shell", "downloads"]);
    },
  );
});

Deno.test("runPack: a pack with no kit given or declared says where to name one", async () => {
  await withProject(ACROSS_STEPS, [], async ({ repoRoot, ports }) => {
    await shipsFor(repoRoot, "unknown");

    await assertRejects(
      () => runPack("unknown", undefined, {}, ports),
      Error,
      "pack.unknown.kit",
    );
  });
});

Deno.test("runBuild: a failing pack stops what needs it, with its code", async () => {
  await withProject(
    ACROSS_STEPS,
    ["cli", "web", "shell"],
    async ({ repoRoot, ports, built, failing }) => {
      await shipsFor(repoRoot, "tool");
      failing.add("tool");

      assertEquals(await runBuild("shell", OPTIONS, ports), 1);
      assertEquals(built, ["web", "cli", "tool"]);
    },
  );
});

Deno.test("needs: a cycle across builds and packs is refused before anything runs", async () => {
  await withProject(
    `build:
  a:
    kit: fake
    needs:
      - pack: b
pack:
  b:
    kit: fake
    needs:
      - build: a
`,
    ["a"],
    async ({ ports, built }) => {
      await assertRejects(
        () => runBuild("a", OPTIONS, ports),
        Error,
        "cycle: build a -> pack b -> build a",
      );
      assertEquals(built, []);
    },
  );
});

Deno.test("runPack: an app something else keeps built is skipped, but still reported to the kit", async () => {
  await withProject(
    ACROSS_STEPS,
    ["cli"],
    async ({ repoRoot, ports, built, needs }) => {
      await shipsFor(repoRoot, "tool");

      await runPack("tool", undefined, {
        skipBuildingApps: new Set(["cli"]),
      }, ports);

      assertEquals(built, ["tool"]);
      assertEquals(needs["tool"], [{
        kind: "build",
        name: "cli",
        output: join(repoRoot, "source/artifacts/cli"),
      }]);
    },
  );
});

Deno.test("runPack: a ship declaring nothing, whose kit doesn't say, still builds every app first", async () => {
  await withProject(
    `build:
  a:
    kit: fake
  b:
    kit: fake
pack:
  plain:
    kit: fake
`,
    ["a", "b"],
    async ({ repoRoot, ports, built }) => {
      await shipsFor(repoRoot, "plain");

      await runPack("plain", undefined, {}, ports);

      assertEquals(built, ["a", "b", "plain"]);
    },
  );
});
