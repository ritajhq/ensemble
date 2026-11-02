import { assertEquals } from "@std/assert";
import { KitProcess } from "./kit-process.ts";
import type { ProcessRunner, ProcessRunOptions } from "./ports.ts";

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
