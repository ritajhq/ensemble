import { assert, assertEquals, assertRejects } from "@std/assert";
import { Backoff, Supervisor } from "./supervisor.ts";
import { Readiness } from "./readiness.ts";
import type { Runnable } from "./values.ts";

const FAST = () => new Backoff(20, 80, 10_000);
const READINESS = new Readiness(3000, 20);

function runnable(name: string, type: Runnable["type"], script: string, ports: Record<string, number> = {}): Runnable {
  return { name, type, argv: ["sh", "-c", script], env: { PATH: Deno.env.get("PATH") ?? "" }, ports };
}

async function until(condition: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!condition() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  assert(condition(), "condition not met in time");
}

Deno.test("backoff doubles to a limit and starts over after a healthy run", () => {
  const backoff = new Backoff(100, 400, 1000);
  assertEquals([0, 0, 0, 0].map((up) => backoff.next(up)), [100, 200, 400, 400]);
  assertEquals(backoff.next(5000), 100);
});

Deno.test("a server that crashes is started again", async () => {
  const supervisor = new Supervisor(Deno.cwd(), READINESS, FAST);
  await supervisor.start([runnable("flaky", "process", "sleep 0.05; exit 1")]);
  const first = supervisor.pidOf("flaky")!;
  await until(() => supervisor.pidOf("flaky") !== undefined && supervisor.pidOf("flaky") !== first);
  await supervisor.stop();
  assertEquals(supervisor.isRunning("flaky"), false);
});

Deno.test("restart replaces the program and stop ends it", async () => {
  const supervisor = new Supervisor(Deno.cwd(), READINESS, FAST);
  await supervisor.start([runnable("server", "process", "sleep 30")]);
  const first = supervisor.pidOf("server")!;
  await supervisor.restart("server");
  assert(supervisor.pidOf("server") !== first);
  await supervisor.stop();
  assertEquals(supervisor.isRunning("server"), false);
});

Deno.test("closing a desktop app ends the session and stops the servers", async () => {
  const supervisor = new Supervisor(Deno.cwd(), READINESS, FAST);
  await supervisor.start([
    runnable("server", "process", "sleep 30"),
    runnable("app", "desktop", "sleep 0.1"),
  ]);
  await supervisor.whenEnded();
  assertEquals(supervisor.isRunning("server"), false);
});

Deno.test("waits for a port before starting the next entry, and fails when it never opens", async () => {
  const supervisor = new Supervisor(Deno.cwd(), new Readiness(300, 20), FAST);
  await assertRejects(
    () => supervisor.start([runnable("mute", "process", "sleep 30", { http: 59871 })]),
    Error,
    "did not start listening on port 59871",
  );
  await supervisor.stop();
});
