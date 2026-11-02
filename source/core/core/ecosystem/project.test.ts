import { join } from "@std/path";
import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { exists } from "@std/fs";
import { Project } from "./project.ts";
import type { Ports } from "../ports.ts";

const UNUSED_PORTS = {} as Pick<Ports, "denoExe" | "process">;

async function withProject(
  config: string,
  run: (repoRoot: string) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir({ prefix: "ensemble-project-test-" });
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble"));
    await Deno.writeTextFile(
      join(repoRoot, ".ensemble", "config.yaml"),
      config,
    );
    await run(repoRoot);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
}

/** A kit that answers `packageAt` from a file, so a real `KitProcess` isn't needed to claim a directory. */
const CLAIMING_PORTS: Pick<Ports, "denoExe" | "process"> = {
  denoExe: { resolveDenoExecutable: () => Promise.resolve("/bin/deno") },
  process: {
    capture: () =>
      Promise.resolve(
        JSON.stringify({ result: { directory: "/x", links: [] } }),
      ),
  } as unknown as Ports["process"],
};

Deno.test("Project: a project declaring no ecosystems is a Deno project", async () => {
  await withProject("{}\n", async (repoRoot) => {
    await Deno.writeTextFile(
      join(repoRoot, "deno.json"),
      JSON.stringify({ name: "@x/app" }),
    );

    const project = await Project.load(repoRoot, UNUSED_PORTS);

    assertEquals((await project.packageAt(repoRoot))?.name, "@x/app");
  });
});

Deno.test("Project: an ecosystem with no kit, other than Deno, is reported", async () => {
  await withProject("ecosystems:\n  - cobol\n", async (repoRoot) => {
    await assertRejects(
      () => Project.load(repoRoot, UNUSED_PORTS),
      Error,
      'Ecosystem "cobol" not found',
    );
  });
});

Deno.test("Project: a directory two ecosystems claim is refused", async () => {
  await withProject("ecosystems:\n  - deno\n  - cargo\n", async (repoRoot) => {
    const kit = join(repoRoot, ".ensemble", "kits", "ecosystem", "cargo");
    await Deno.mkdir(kit, { recursive: true });
    await Deno.writeTextFile(join(kit, "main.ts"), "");
    await Deno.writeTextFile(join(repoRoot, "deno.json"), "{}");

    const project = await Project.load(repoRoot, CLAIMING_PORTS);

    await assertRejects(
      () => project.packageAt(repoRoot),
      Error,
      "claimed by more than one ecosystem: deno, cargo",
    );
  });
});

Deno.test("Project.named: the first declared is the default, and an undeclared one is refused", async () => {
  await withProject("ecosystems:\n  - deno\n", async (repoRoot) => {
    const project = await Project.load(repoRoot, UNUSED_PORTS);

    assertEquals(project.named(), project.named("deno"));
    assertThrows(() => project.named("cargo"), Error, "doesn't declare");
  });
});

Deno.test("Project.sync: Deno's config is current before any ecosystem kit is launched through it", async () => {
  await withProject("ecosystems:\n  - cargo\n  - deno\n", async (repoRoot) => {
    const kit = join(repoRoot, ".ensemble", "kits", "ecosystem", "cargo");
    await Deno.mkdir(kit, { recursive: true });
    await Deno.writeTextFile(join(kit, "main.ts"), "");
    const config = join(repoRoot, ".ensemble/ecosystems/deno/deno.json");
    let configExistedForKit = false;
    const ports = {
      denoExe: { resolveDenoExecutable: () => Promise.resolve("/bin/deno") },
      process: {
        capture: async () => {
          configExistedForKit = await exists(config);
          return JSON.stringify({ result: null });
        },
      },
    } as unknown as Pick<Ports, "denoExe" | "process">;

    await (await Project.load(repoRoot, ports)).sync();

    assertEquals(configExistedForKit, true);
  });
});
