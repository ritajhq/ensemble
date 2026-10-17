import { assertEquals } from "@std/assert";
import type { ProbeResult, ProcessRunner } from "./ports.ts";
import { ReleaseService, ReleaseStateStore } from "./release.ts";

/** A git that only knows `tags`, and records every other command it's asked to run. */
class FakeGit implements ProcessRunner {
  readonly execs: string[][] = [];

  constructor(private readonly tags: readonly string[]) {}

  run(): Promise<number> {
    return Promise.resolve(0);
  }

  exec(_command: string, args: readonly string[]): Promise<void> {
    this.execs.push([...args]);
    return Promise.resolve();
  }

  capture(): Promise<string> {
    return Promise.resolve(this.tags.join("\n"));
  }

  probe(): Promise<ProbeResult> {
    return Promise.resolve({ code: 0, stderr: "" });
  }
}

const FINISHED = {
  pushed: true,
  packedShips: ["cli"],
  publishedShips: ["cli"],
  publishedCoreLibs: ["@ensemble/core"],
  hookRan: true,
};

Deno.test("ReleaseService.undo: deletes the last tag's ceremony record, so re-creating that tag starts a fresh release", async () => {
  const repoRoot = await Deno.makeTempDir({ prefix: "ensemble-release-undo-" });
  try {
    const store = new ReleaseStateStore(repoRoot);
    await store.write({ tag: "0.2.0", ...FINISHED });
    await store.write({ tag: "0.1.0", ...FINISHED });
    const git = new FakeGit(["0.1.0", "0.2.0"]);

    const result = await new ReleaseService(repoRoot, git).undo({});

    assertEquals(result.tag, "0.2.0");
    assertEquals(git.execs, [["tag", "-d", "0.2.0"]]);
    assertEquals((await store.read("0.2.0")).hookRan, false);
    assertEquals((await store.read("0.1.0")).hookRan, true);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});

Deno.test("ReleaseService.undo: a dry run leaves the tag's ceremony record alone", async () => {
  const repoRoot = await Deno.makeTempDir({ prefix: "ensemble-release-undo-" });
  try {
    const store = new ReleaseStateStore(repoRoot);
    await store.write({ tag: "0.2.0", ...FINISHED });

    await new ReleaseService(repoRoot, new FakeGit(["0.2.0"])).undo({
      dryRun: true,
    });

    assertEquals((await store.read("0.2.0")).hookRan, true);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});
