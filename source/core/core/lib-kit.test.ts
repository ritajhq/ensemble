import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { LibKit } from "./lib-kit.ts";
import { KitFailure } from "./kit-process.ts";
import type { Ports } from "./ports.ts";

/** A project whose lib kit `poly` is there to be run, on a runner that has the kit exit with `code`. */
async function libKitExiting(code: number): Promise<LibKit> {
  const root = await Deno.makeTempDir({ prefix: "lib-kit-test-" });
  const kitDir = join(root, ".ensemble", "kits", "lib", "poly");
  await Deno.mkdir(kitDir, { recursive: true });
  await Deno.writeTextFile(join(kitDir, "kit.yml"), "role: lib\nprotocol: 1\n");
  await Deno.writeTextFile(join(kitDir, "main.ts"), "");
  return new LibKit("poly", {
    repo: { findRepoRoot: () => Promise.resolve(root) },
    denoExe: { resolveDenoExecutable: () => Promise.resolve("deno") },
    process: { run: () => Promise.resolve(code) },
  } as unknown as Ports);
}

const INPUT = { libRoot: "source/libs/x", package: "x", version: "1.0.0" };

Deno.test("LibKit: a failed stamp is a kit failure carrying the kit's exit code", async () => {
  const failure = await assertRejects(
    async () => await (await libKitExiting(3)).stamp(INPUT),
    KitFailure,
    'Stamping "x" with lib kit "poly" failed.',
  );
  assertEquals(failure.code, 3);
});

Deno.test("LibKit: a failed publish is a kit failure carrying the kit's exit code", async () => {
  const failure = await assertRejects(
    async () => await (await libKitExiting(5)).publish(INPUT),
    KitFailure,
  );
  assertEquals(failure.code, 5);
});
