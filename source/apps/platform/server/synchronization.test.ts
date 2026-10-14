import { assertEquals } from "@std/assert";
import * as Platform from "@ensemble/platform";
import type { Checkout, Checkouts } from "./checkouts.ts";
import { Synchronization } from "./synchronization.ts";

/** Checkouts that wait to be released, counting how often each project was brought up to date. */
class HeldCheckouts {
  readonly updates: string[] = [];
  private release = Promise.withResolvers<void>();

  async update(project: Platform.Project): Promise<Checkout> {
    this.updates.push(project.id);
    await this.release.promise;
    return { path: "/nowhere", commit: `commit-${this.updates.length}` };
  }

  releaseAll(): void {
    this.release.resolve();
  }
}

const project = Platform.Project.create({
  id: "portal",
  repository: "ritajhq/portal",
  ref: "main",
});

Deno.test("Synchronization: requests arriving during a sync fold into one more, not one each", async () => {
  const checkouts = new HeldCheckouts();
  const synchronization = new Synchronization(
    checkouts as unknown as Checkouts,
    new Platform.Discovery(),
  );
  const synced: string[] = [];
  const done = Promise.withResolvers<void>();
  synchronization.OnSynced.Do((_, catalog) => {
    synced.push(catalog.commit);
    if (synced.length === 2) done.resolve();
  });

  synchronization.request(project);
  synchronization.request(project);
  synchronization.request(project);
  checkouts.releaseAll();
  await done.promise;

  assertEquals(checkouts.updates, ["portal", "portal"]);
  assertEquals(synced, ["commit-1", "commit-2"]);
});

Deno.test("Synchronization: a failing checkout is announced, with its error", async () => {
  const synchronization = new Synchronization(
    {
      update: () => Promise.reject(new Error("no such ref")),
    } as unknown as Checkouts,
    new Platform.Discovery(),
  );
  const failed = Promise.withResolvers<unknown>();
  synchronization.OnFailed.Do((_, error) => failed.resolve(error));

  synchronization.request(project);

  assertEquals((await failed.promise as Error).message, "no such ref");
});
