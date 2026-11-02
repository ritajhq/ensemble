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

const CARGO_PINNING_PORTS: Pick<Ports, "denoExe" | "process"> = {
  denoExe: { resolveDenoExecutable: () => Promise.resolve("/bin/deno") },
  process: {
    capture: () =>
      Promise.resolve(
        JSON.stringify({ result: { RUSTUP_TOOLCHAIN: "1.90.0" } }),
      ),
  } as unknown as Ports["process"],
};

async function writeCargoKit(repoRoot: string): Promise<void> {
  const kit = join(repoRoot, ".ensemble/kits/ecosystem/cargo");
  await Deno.mkdir(kit, { recursive: true });
  await Deno.writeTextFile(join(kit, "main.ts"), "");
  await Deno.writeTextFile(
    join(kit, "kit.yml"),
    "role: ecosystem\nprotocol: 1\n",
  );
}

Deno.test("Project: loading puts what a pinned tool needs in the environment", async () => {
  await withProject(
    "ecosystems:\n  - cargo\ntools:\n  cargo:\n    rust: 1.90.0\n",
    async (repoRoot) => {
      await writeCargoKit(repoRoot);
      const set: Record<string, string> = {};
      await Project.load(repoRoot, CARGO_PINNING_PORTS, {
        set: (variable, value) => set[variable] = value,
      });
      assertEquals(set, { RUSTUP_TOOLCHAIN: "1.90.0" });
    },
  );
});

Deno.test("Project: a project pinning nothing leaves the environment alone", async () => {
  await withProject("ecosystems:\n  - cargo\n", async (repoRoot) => {
    await writeCargoKit(repoRoot);
    const set: Record<string, string> = {};
    await Project.load(repoRoot, CARGO_PINNING_PORTS, {
      set: (variable, value) => set[variable] = value,
    });
    assertEquals(set, {});
  });
});

Deno.test("Project: tools for an ecosystem it doesn't declare are refused", async () => {
  await withProject(
    "tools:\n  cargo:\n    rust: 1.90.0\n",
    async (repoRoot) => {
      await assertRejects(
        () => Project.load(repoRoot, UNUSED_PORTS),
        Error,
        "an ecosystem this project doesn't declare",
      );
    },
  );
});

Deno.test("Project: a version YAML read as a number is refused, rather than pinning 1.9", async () => {
  await withProject("tools:\n  deno:\n    deno: 2.10\n", async (repoRoot) => {
    await assertRejects(
      () => Project.load(repoRoot, UNUSED_PORTS),
      Error,
      "so quote it",
    );
  });
});

Deno.test("Project: a Deno version other than the pinned one is refused", async () => {
  await withProject('tools:\n  deno:\n    deno: "2.5"\n', async (repoRoot) => {
    const ports = {
      denoExe: { resolveDenoExecutable: () => Promise.resolve("/bin/deno") },
      process: { capture: () => Promise.resolve("deno 2.4.1 (stable)") },
    } as unknown as Pick<Ports, "denoExe" | "process">;
    await assertRejects(
      () => Project.load(repoRoot, ports),
      Error,
      "pins 2.5, but this machine has 2.4.1",
    );
  });
});
