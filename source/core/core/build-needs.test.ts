import { join } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import { runBuild } from "./build.ts";
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
  const repoRoot = await Deno.makeTempDir({ prefix: "ensemble-needs-test-" });
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble", "kits", "build", "fake"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(repoRoot, ".ensemble", "kits", "build", "fake", "main.ts"),
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

    await runBuild("web", { ...OPTIONS, built: shared }, ports);
    await runBuild("shell", { ...OPTIONS, built: shared }, ports);

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
        "cycle: a -> b -> a",
      );
    },
  );
});
