import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { KitFailure, KitProcess } from "./kit-process.ts";
import {
  CommandFailure,
  type ProcessRunner,
  type ProcessRunOptions,
} from "./ports.ts";

function recordingKit(): {
  kit: KitProcess;
  calls: { args: readonly string[]; options?: ProcessRunOptions }[];
} {
  const calls: { args: readonly string[]; options?: ProcessRunOptions }[] = [];
  const process = {
    run: (
      _command: string,
      args: readonly string[],
      options?: ProcessRunOptions,
    ) => {
      calls.push({ args, options });
      return Promise.resolve(3);
    },
  } as unknown as ProcessRunner;
  const kit = new KitProcess("/kits/build/cargo", {
    denoExe: { resolveDenoExecutable: () => Promise.resolve("/bin/deno") },
    process,
  });
  return { kit, calls };
}

Deno.test("KitProcess: a kit runs from its own directory, and its exit code is returned", async () => {
  const { kit, calls } = recordingKit();

  const code = await kit.run("main.ts", ["--name", "web"], {
    env: { MODE: "x" },
  });

  assertEquals(code, 3);
  assertEquals(calls[0].options, {
    env: { MODE: "x" },
    cwd: "/kits/build/cargo",
  });
});

Deno.test("KitProcess: the entrypoint comes before the kit's own arguments", async () => {
  const { kit } = recordingKit();

  const command = await kit.commandLine("main.ts", ["--name", "web"]);

  assertEquals(command.slice(0, 2), ["/bin/deno", "run"]);
  assertEquals(command.slice(-3), [
    "/kits/build/cargo/main.ts",
    "--name",
    "web",
  ]);
});

Deno.test("KitProcess: a failed capture names the kit, keeping its command line and exit code", async () => {
  const process = {
    capture: () =>
      Promise.reject(new CommandFailure("/bin/deno run main.ts sync", 4)),
  } as unknown as ProcessRunner;
  const kit = new KitProcess("/kits/ecosystem/poly", {
    denoExe: { resolveDenoExecutable: () => Promise.resolve("/bin/deno") },
    process,
  });

  const failure = await assertRejects(
    () => kit.capture("main.ts", []),
    KitFailure,
    'Kit "poly" failed with exit code 4.',
  );

  assertEquals(failure.code, 4);
  assertStringIncludes(failure.detail!, "/bin/deno run main.ts sync");
});

/** Runs a kit whose whole entrypoint is `source`, on the real Deno. */
async function runKit(
  source: string,
  env: Record<string, string> = {},
): Promise<{ code: number; stderr: string }> {
  const directory = await Deno.makeTempDir({ prefix: "kit-process-test-" });
  await Deno.writeTextFile(join(directory, "main.ts"), source);
  const [command, ...args] = await new KitProcess(directory, {
    denoExe: { resolveDenoExecutable: () => Promise.resolve(Deno.execPath()) },
    process: {} as ProcessRunner,
  }).commandLine("main.ts", []);
  const { code, stderr } = await new Deno.Command(command, {
    args,
    cwd: directory,
    env,
    stderr: "piped",
    stdout: "null",
  }).output();
  return { code, stderr: new TextDecoder().decode(stderr) };
}

for (
  const [label, source] of [
    ["a top-level throw", `throw new Error("the reason");`],
    ["a rejected await", `await Promise.reject(new Error("the reason"));`],
    [
      "a floating rejection",
      `Promise.reject(new Error("the reason"));
       await new Promise((resolve) => setTimeout(resolve, 50));`,
    ],
  ]
) {
  Deno.test(`KitProcess: ${label} reads as its message alone, exiting 1`, async () => {
    const { code, stderr } = await runKit(source);
    assertEquals(code, 1);
    assertEquals(stderr, "error: the reason\n");
  });

  Deno.test(`KitProcess: ENS_DEBUG keeps the stack of ${label}`, async () => {
    const { code, stderr } = await runKit(source, { ENS_DEBUG: "1" });
    assertEquals(code, 1);
    assertStringIncludes(stderr, "the reason");
    assertStringIncludes(stderr, "main.ts:");
  });
}

Deno.test("KitProcess: a kit's own exit code stands", async () => {
  const { code, stderr } = await runKit(`Deno.exit(7);`);
  assertEquals(code, 7);
  assertEquals(stderr, "");
});
