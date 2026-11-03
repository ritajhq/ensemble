import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { EnsembleConfigStore } from "./config.ts";
import { runSetBuildKit } from "./app.ts";
import type { Ports } from "./ports.ts";

/** A project with a build kit `tauri` that needs the `cargo` ecosystem, whose kit answers every question with `{}`. */
async function withKitNeedingCargo(
  run: (ports: Ports, repoRoot: string) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir({ prefix: "ensemble-app-test-" });
  try {
    const kits = join(repoRoot, ".ensemble", "kits");
    await Deno.mkdir(join(kits, "build", "tauri"), { recursive: true });
    await Deno.writeTextFile(join(kits, "build", "tauri", "main.ts"), "");
    await Deno.writeTextFile(
      join(kits, "build", "tauri", "kit.yml"),
      "role: build\nprotocol: 1\necosystem: cargo\n",
    );
    await Deno.mkdir(join(kits, "ecosystem", "cargo"), { recursive: true });
    await Deno.writeTextFile(join(kits, "ecosystem", "cargo", "main.ts"), "");
    await Deno.writeTextFile(
      join(repoRoot, ".ensemble", "config.yaml"),
      "{}\n",
    );
    await run({
      repo: { findRepoRoot: () => Promise.resolve(repoRoot) },
      denoExe: { resolveDenoExecutable: () => Promise.resolve("/bin/deno") },
      process: { capture: () => Promise.resolve("{}") },
    } as unknown as Ports, repoRoot);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
}

Deno.test("runSetBuildKit: sets the app's kit and adds the ecosystem the kit declares", async () => {
  await withKitNeedingCargo(async (ports, repoRoot) => {
    await runSetBuildKit("shell", "tauri", ports);

    const config = await new EnsembleConfigStore(repoRoot).load();
    assertEquals(config.build?.shell?.kit, "tauri");
    assertEquals(config.ecosystems, ["deno", "cargo"]);
  });
});
