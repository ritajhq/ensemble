import { assertEquals } from "@std/assert";
import * as Platform from "@ensemble/platform";
import type { Checkout, Checkouts } from "./checkouts.ts";
import { Runner } from "./runner.ts";
import type { Ensemble } from "./ensemble.ts";
import * as Kv from "./kv.ts";
import { Vault } from "./vault.ts";

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

/** An `ens` that prints what it was given, then exits as told. */
class FakeEnsemble {
  received?: Readonly<Record<string, string>>;
  released?: Readonly<Record<string, string>>;

  release(
    _release: Platform.Release,
    _checkout: string,
    credentials: Readonly<Record<string, string>>,
    onLine: (line: string) => void,
  ): Promise<void> {
    this.released = credentials;
    onLine(`publishing with ${credentials.JSR_TOKEN}`);
    return Promise.resolve();
  }
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

/** Checkouts that note whether work ran in the checkout as it was, or refreshed first. */
const used: string[] = [];
const checkouts = {
  use: <T>(_: Platform.Project, work: (checkout: Checkout) => Promise<T>) => {
    used.push("as it was");
    return work({ path: "/checkout", commit: "abc123" });
  },
  refresh: <T>(
    _: Platform.Project,
    work: (checkout: Checkout) => Promise<T>,
  ) => {
    used.push("refreshed");
    return work({ path: "/checkout", commit: "def456" });
  },
} as unknown as Checkouts;

async function carriedOut(ensemble: FakeEnsemble, work?: Platform.Work) {
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

  const credentials = new Kv.Credentials(kv, await Vault.of(KEY));
  await credentials.set("portal", "JSR_TOKEN", "jsr-secret");
  const deploys = new Runner(
    projects,
    environments,
    values,
    credentials,
    new Kv.PreviewSettings(kv),
    checkouts,
    ensemble as unknown as Ensemble,
    "example.com",
  );
  const states: string[] = [];
  const lines: string[] = [];
  const finished = Promise.withResolvers<Platform.Run>();
  deploys.OnStarted.Do((run) => states.push(run.state));
  deploys.OnPrinted.Do((_, index, line) => lines.push(`${index}:${line}`));
  deploys.OnFinished.Do((run) => finished.resolve(run));

  deploys.request(
    Platform.Run.queue(
      work ?? Platform.Deployment.create({
        project: "portal",
        manifest: "web",
        environment: "production",
        kit: "compose",
        version: "1.0.0",
        termination: "apply",
      }),
    ),
  );
  const run = await finished.promise;
  kv.close();
  return { run, states, lines };
}

Deno.test("Runner: the environment's values reach ens under the names it reads them by", async () => {
  const ensemble = new FakeEnsemble();
  const { run, states } = await carriedOut(ensemble);

  assertEquals(ensemble.received, {
    PUBLIC_HOST: "ritaj.app",
    DB_PASSWORD: "hunter22",
  });
  assertEquals(states, ["running"]);
  assertEquals(run.state, "succeeded");
  assertEquals(run.commit, "abc123");
});

Deno.test("Runner: a secret's value is masked wherever the run prints it", async () => {
  const { lines } = await carriedOut(new FakeEnsemble());
  assertEquals(lines, ["0:connecting with ••••", "1:done"]);
});

Deno.test("Runner: a failing ens fails the run, with its reason", async () => {
  const { run } = await carriedOut(new FakeEnsemble(true));
  assertEquals(run.state, "failed");
  assertEquals(run.error, "ens deploy exited with code 1.");
});

Deno.test("Runner: a release runs at the ref's tip, with the project's credentials, masked in its output", async () => {
  used.length = 0;
  const ensemble = new FakeEnsemble();
  const { run, lines } = await carriedOut(
    ensemble,
    Platform.Release.create({
      project: "portal",
      action: "next",
      argument: "patch",
    }),
  );

  assertEquals(used, ["refreshed"]);
  assertEquals(ensemble.released, { JSR_TOKEN: "jsr-secret" });
  assertEquals(lines, ["0:publishing with ••••"]);
  assertEquals(run.state, "succeeded");
  assertEquals(run.commit, "def456");
});

/** A checkout of branch "feat-x" whose last preview deploy recorded a gateway answering on its internal domain, and on one host outside it. */
async function previewCheckout(): Promise<string> {
  const path = await Deno.makeTempDir();
  const record = `${path}/.ensemble/deploy/web--preview-feat-x`;
  await Deno.mkdir(record, { recursive: true });
  await Deno.writeTextFile(
    `${record}/compose.ingress.json`,
    JSON.stringify({
      version: 1,
      deployment: "portal-web--preview-feat-x",
      ingresses: [{
        service: "gateway",
        networks: ["ingress"],
        alias: "portal-web--preview-feat-x",
        scheme: "http",
        port: 80,
        hosts: [
          "feat-x.portal.preview.internal",
          "dashboard.feat-x.portal.preview.internal",
          "ritaj.app",
        ],
      }],
    }),
  );
  return path;
}

Deno.test("Runner: a preview runs with its base environment's values and its own overrides, and is published at its public hosts", async () => {
  const kv = await Deno.openKv(":memory:");
  const projects = new Kv.Projects(kv);
  const environments = new Kv.Environments(kv);
  const values = new Kv.Values(kv, await Vault.of(KEY));
  const settings = new Kv.PreviewSettings(kv);
  await projects.add(
    Platform.Project.create({
      id: "portal",
      repository: "ritajhq/portal",
      ref: "main",
    }),
  );
  const base = Platform.Environment.create("portal", "web", "preview");
  await environments.add(base);
  await values.setVariable(base, "domain", "staging.ritaj.app");
  await values.setSecret(base, "db-password", "preview-db-pass");
  await settings.set(Platform.PreviewSettings.create({
    project: "portal",
    manifest: "web",
    branches: ["feat-*"],
    base: "preview",
    kit: "compose",
    overrides: {
      domain: "{internal}",
      "dashboard-origin": "https://{host:dashboard}",
    },
  }));

  const checkout = await previewCheckout();
  const received: Record<string, string>[] = [];
  const commands: string[] = [];
  const runner = new Runner(
    projects,
    environments,
    values,
    new Kv.Credentials(kv, await Vault.of(KEY)),
    settings,
    {
      branch: <T>(
        _: Platform.Project,
        branch: string,
        work: (checkout: Checkout) => Promise<T>,
      ) => {
        commands.push(`checkout ${branch}`);
        return work({ path: checkout, commit: "abc123" });
      },
      lastOfBranch: (
        _: Platform.Project,
        branch: string,
        work: (checkout: Checkout) => Promise<void>,
      ) => {
        commands.push(`last of ${branch}`);
        return work({ path: checkout, commit: "abc123" });
      },
    } as unknown as Checkouts,
    {
      preview: (
        change: Platform.PreviewChange,
        instance: string,
        _checkout: string,
        given: Record<string, string>,
      ) => {
        commands.push(`${change.intent} ${instance}`);
        received.push(given);
        return Promise.resolve();
      },
    } as unknown as Ensemble,
    "ensemble.blue",
  );
  const answering: [string, unknown][] = [];
  const withdrawn: string[] = [];
  const up: Kv.LivePreview[] = [];
  runner.OnAnswering.Do((owner, ingresses) =>
    answering.push([owner, ingresses])
  );
  runner.OnWithdrawn.Do((owner) => withdrawn.push(owner));
  runner.OnPreviewUp.Do((preview) => up.push(preview));

  const carry = async (intent: string) => {
    const finished = Promise.withResolvers<Platform.Run>();
    const subscription = runner.OnFinished.DoOnce((run) =>
      finished.resolve(run)
    );
    runner.request(Platform.Run.queue(Platform.PreviewChange.create({
      project: "portal",
      manifest: "web",
      branch: "feat-x",
      intent,
      kit: "compose",
    })));
    const run = await finished.promise;
    subscription.Dispose();
    return run;
  };

  assertEquals((await carry("deploy")).state, "succeeded");
  assertEquals(received[0], {
    DOMAIN: "feat-x.portal.preview.internal",
    DB_PASSWORD: "preview-db-pass",
    DASHBOARD_ORIGIN: "https://dashboard--feat-x--portal.ensemble.blue",
  });
  assertEquals(answering[0][0], "portal/web/preview-feat-x");
  assertEquals(
    (answering[0][1] as { rewrites: Record<string, string> }[])[0].rewrites,
    {
      "feat-x--portal.ensemble.blue": "feat-x.portal.preview.internal",
      "dashboard--feat-x--portal.ensemble.blue":
        "dashboard.feat-x.portal.preview.internal",
    },
  );
  assertEquals(up[0].hosts, [
    "feat-x--portal.ensemble.blue",
    "dashboard--feat-x--portal.ensemble.blue",
  ]);

  assertEquals((await carry("destroy")).state, "succeeded");
  assertEquals(withdrawn, ["portal/web/preview-feat-x"]);
  assertEquals(commands, [
    "checkout feat-x",
    "deploy preview-feat-x",
    "last of feat-x",
    "destroy preview-feat-x",
  ]);
  kv.close();
});
