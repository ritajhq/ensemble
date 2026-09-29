import { assertEquals } from "@std/assert";
import { WatchSessionRecord } from "./watch-session-record.ts";

async function withRecord(
  run: (record: WatchSessionRecord, path: string) => Promise<void>,
): Promise<void> {
  const dir = await Deno.makeTempDir();
  try {
    await run(
      WatchSessionRecord.for(dir, "portal"),
      `${dir}/.ensemble/deploy/portal/watch-session`,
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("WatchSessionRecord.reclaimStale: stops a recorded process that is still running the watch command", async () => {
  await withRecord(async (record, path) => {
    const orphan = new Deno.Command("sleep", { args: ["300"] }).spawn();
    await record.begin(orphan.pid);

    assertEquals(await record.reclaimStale(["300"]), orphan.pid);
    assertEquals((await orphan.status).success, false);
    assertEquals(await Deno.stat(path).catch(() => undefined), undefined);
  });
});

Deno.test("WatchSessionRecord.reclaimStale: leaves alone a live process running something else — the PID was recycled", async () => {
  await withRecord(async (record) => {
    const bystander = new Deno.Command("sleep", { args: ["300"] }).spawn();
    try {
      await record.begin(bystander.pid);

      assertEquals(await record.reclaimStale(["some", "watch"]), undefined);
      Deno.kill(bystander.pid, "SIGCONT"); // throws if it was killed
    } finally {
      bystander.kill("SIGKILL");
      await bystander.status;
    }
  });
});

Deno.test("WatchSessionRecord.reclaimStale: does nothing when no session was recorded", async () => {
  await withRecord(async (record) => {
    assertEquals(await record.reclaimStale(["watch"]), undefined);
  });
});

Deno.test("WatchSessionRecord.end: forgets the session", async () => {
  await withRecord(async (record) => {
    await record.begin(Deno.pid);
    await record.end();

    assertEquals(await record.reclaimStale([]), undefined);
  });
});
