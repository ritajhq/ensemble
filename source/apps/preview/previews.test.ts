import { assertEquals } from "@std/assert";
import { Configuration } from "./configuration.ts";
import { Previews, type PreviewWork } from "./previews.ts";

const configuration = Configuration.parse(`
domain: preview.test
workspace: /w
repositories:
  app:
    repo: o/app
    delivery: app
    branches:
      - "*"
`);
const repository = configuration.repository("app")!;
const preview = (branch: string) => configuration.previewOf(repository, branch);

/** Work that finishes only when the test says so, recording what ran. */
class GatedWork implements PreviewWork {
  readonly log: string[] = [];
  private gates: Array<() => void> = [];

  deploy(p: ReturnType<typeof preview>): Promise<void> {
    return this.gate(`deploy ${p.branch}`);
  }

  destroy(p: ReturnType<typeof preview>): Promise<void> {
    return this.gate(`destroy ${p.branch}`);
  }

  async finishCurrent(): Promise<void> {
    this.gates.shift()!();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  private gate(entry: string): Promise<void> {
    this.log.push(entry);
    return new Promise((resolve) => this.gates.push(resolve));
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

Deno.test("Previews folds pushes that arrive mid-deploy into one follow-up", async () => {
  const work = new GatedWork();
  const previews = new Previews(work);

  previews.pushed(preview("x"));
  await tick();
  previews.pushed(preview("x"));
  previews.pushed(preview("x"));
  previews.pushed(preview("x"));
  assertEquals(work.log, ["deploy x"]);

  await work.finishCurrent();
  assertEquals(work.log, ["deploy x", "deploy x"]);
  await work.finishCurrent();
  assertEquals(work.log, ["deploy x", "deploy x"]);
});

Deno.test("Previews destroys a branch deleted mid-deploy once that deploy ends, without deploying it again", async () => {
  const work = new GatedWork();
  const previews = new Previews(work);

  previews.pushed(preview("x"));
  await tick();
  previews.pushed(preview("x"));
  previews.deleted(preview("x"));

  await work.finishCurrent();
  assertEquals(work.log, ["deploy x", "destroy x"]);
});

Deno.test("Previews runs different branches side by side, and reports a failure without stopping", async () => {
  const failures: string[] = [];
  const work: PreviewWork = {
    deploy: (p) =>
      p.branch === "bad"
        ? Promise.reject(new Error("boom"))
        : Promise.resolve(),
    destroy: () => Promise.resolve(),
  };
  const previews = new Previews(work);
  const deployed: string[] = [];
  previews.OnFailed.Do((p, intent) => failures.push(`${intent} ${p.branch}`));
  previews.OnDeployed.Do((p) => deployed.push(p.branch));

  previews.pushed(preview("bad"));
  previews.pushed(preview("good"));
  await tick();

  assertEquals(failures, ["deploy bad"]);
  assertEquals(deployed, ["good"]);
});
