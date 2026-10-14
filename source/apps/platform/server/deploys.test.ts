import { assertEquals } from "@std/assert";
import * as Platform from "@ensemble/platform";
import type { Checkout, Checkouts } from "./checkouts.ts";
import { Deploys } from "./deploys.ts";
import type { Ensemble } from "./ensemble.ts";
import * as Kv from "./kv.ts";
import { Vault } from "./vault.ts";

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

/** An `ens` that prints what it was given, then exits as told. */
class FakeEnsemble {
  received?: Readonly<Record<string, string>>;
  constructor(private readonly fails = false) {}

  deploy(
    _deployment: Platform.Deployment,
    _checkout: string,
    values: Readonly<Record<string, string>>,
    onLine: (line: string) => void,
  ): Promise<void> {
    this.received = values;
    onLine(`connecting with ${values.DB_PASSWORD}`);
    onLine("done");
    return this.fails
      ? Promise.reject(new Error("ens deploy exited with code 1."))
      : Promise.resolve();
  }
}

const checkouts = {
  use: <T>(_: Platform.Project, work: (checkout: Checkout) => Promise<T>) =>
    work({ path: "/checkout", commit: "abc123" }),
} as unknown as Checkouts;

async function deployed(ensemble: FakeEnsemble) {
  const kv = await Deno.openKv(":memory:");
  const projects = new Kv.Projects(kv);
  const environments = new Kv.Environments(kv);
  const values = new Kv.Values(kv, await Vault.of(KEY));
  await projects.add(
    Platform.Project.create({
      id: "portal",
      repository: "ritajhq/portal",
      ref: "main",
    }),
  );
  const production = Platform.Environment.first("portal", "web");
  await environments.add(production);
  await values.setVariable(production, "public-host", "ritaj.app");
  await values.setSecret(production, "db-password", "hunter22");

  const deploys = new Deploys(
    projects,
    environments,
    values,
    checkouts,
    ensemble as unknown as Ensemble,
  );
  const states: string[] = [];
  const lines: string[] = [];
  const finished = Promise.withResolvers<Platform.Run>();
  deploys.OnStarted.Do((run) => states.push(run.state));
  deploys.OnPrinted.Do((_, index, line) => lines.push(`${index}:${line}`));
  deploys.OnFinished.Do((run) => finished.resolve(run));

  deploys.request(
    Platform.Run.queue(Platform.Deployment.create({
      project: "portal",
      manifest: "web",
      environment: "production",
      kit: "compose",
      version: "1.0.0",
      termination: "apply",
    })),
  );
  const run = await finished.promise;
  kv.close();
  return { run, states, lines };
}

Deno.test("Deploys: the environment's values reach ens under the names it reads them by", async () => {
  const ensemble = new FakeEnsemble();
  const { run, states } = await deployed(ensemble);

  assertEquals(ensemble.received, {
    PUBLIC_HOST: "ritaj.app",
    DB_PASSWORD: "hunter22",
  });
  assertEquals(states, ["running"]);
  assertEquals(run.state, "succeeded");
  assertEquals(run.commit, "abc123");
});

Deno.test("Deploys: a secret's value is masked wherever the run prints it", async () => {
  const { lines } = await deployed(new FakeEnsemble());
  assertEquals(lines, ["0:connecting with ••••", "1:done"]);
});

Deno.test("Deploys: a failing ens fails the run, with its reason", async () => {
  const { run } = await deployed(new FakeEnsemble(true));
  assertEquals(run.state, "failed");
  assertEquals(run.error, "ens deploy exited with code 1.");
});
