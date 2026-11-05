import { assert, assertEquals } from "@std/assert";
import type { LaunchEntry } from "../deploy/launch.ts";
import { Readiness } from "./readiness.ts";
import { type Outputs, Session } from "./session.ts";
import { Backoff, Supervisor } from "./supervisor.ts";

const base = { ports: {}, env: {}, envSecrets: {} };

class FakeOutputs implements Outputs {
  prepared: string[] = [];
  kept: string[] = [];
  prepare(builds: readonly string[], packs: readonly string[]): Promise<void> {
    this.prepared.push(...builds.map((b) => `build:${b}`), ...packs.map((p) => `pack:${p}`));
    return Promise.resolve();
  }
  keepCurrent(builds: readonly string[], packs: readonly string[], signal: AbortSignal): Promise<void> {
    this.kept.push(...builds.map((b) => `build:${b}`), ...packs.map((p) => `pack:${p}`));
    return new Promise((resolve) => signal.addEventListener("abort", () => resolve()));
  }
}

Deno.test("builds first, starts in reference order, restarts on a build change, stops on abort", async () => {
  const dir = await Deno.makeTempDir();
  const entries: Record<string, LaunchEntry> = {
    server: {
      ...base,
      type: "process",
      command: ["sh", "-c", "sleep 30"],
      env: { A: "${build.kernel}" },
      development: { restart: [{ build: "kernel" }] },
    },
  };
  const outputs = new FakeOutputs();
  const supervisor = new Supervisor(dir, new Readiness(1000, 20), () => new Backoff(20, 80));
  const session = new Session(
    entries,
    { builds: new Set(["kernel"]), packs: new Set() },
    { build: () => dir, pack: () => dir },
    outputs,
    supervisor,
  );
  const abort = new AbortController();
  const running = session.run(abort.signal);

  const deadline = Date.now() + 3000;
  while (supervisor.pidOf("server") === undefined && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  const first = supervisor.pidOf("server")!;
  assertEquals(outputs.prepared, ["build:kernel"]);
  assertEquals(outputs.kept, ["build:kernel"]);

  await new Promise((r) => setTimeout(r, 200));
  await Deno.writeTextFile(`${dir}/changed`, "x");
  const again = Date.now() + 4000;
  while (supervisor.pidOf("server") === first && Date.now() < again) await new Promise((r) => setTimeout(r, 20));
  assert(supervisor.pidOf("server") !== first && supervisor.pidOf("server") !== undefined, "restarted after the change");

  abort.abort();
  await running;
  assertEquals(supervisor.isRunning("server"), false);
  await Deno.remove(dir, { recursive: true });
});
