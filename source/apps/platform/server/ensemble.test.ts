import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import * as Platform from "@ensemble/platform";
import { CommandFailedError, Ensemble } from "./ensemble.ts";

/** An `ens` that prints its arguments and every variable it was given, then exits with `$EXIT`. */
async function fakeEns(): Promise<string> {
  const dir = await Deno.makeTempDir();
  const path = join(dir, "ens");
  await Deno.writeTextFile(
    path,
    '#!/bin/sh\necho "args: $*"\nenv | sort | grep -v "^PWD=\\|^SHLVL=\\|^_=" \necho "to stderr" >&2\nexit "${EXIT:-0}"\n',
  );
  await Deno.chmod(path, 0o755);
  return path;
}

function deployment(fields: Partial<Record<string, string>> = {}) {
  return Platform.Deployment.create({
    project: "portal",
    manifest: "web",
    environment: "production",
    kit: "compose",
    version: "1.2.3",
    termination: "apply",
    ...fields,
  });
}

const RELEASER = {
  name: "ensemble platform",
  email: "platform@example.com",
  token: "gh-token",
};

/** A host environment holding the platform's own secrets beside what ens may see. */
const host = {
  get: (name: string) =>
    ({
      PATH: Deno.env.get("PATH"),
      HOME: "/home/platform",
      PLATFORM_SECRET_KEY: "never-pass-me",
      GITHUB_TOKEN: "never-pass-me",
    })[name],
} as Deno.Env;

Deno.test("Ensemble: deploys published artifacts at the version, with only the environment's values and the host's plumbing", async () => {
  const lines: string[] = [];
  await new Ensemble(await fakeEns(), RELEASER, host).deploy(
    deployment(),
    await Deno.makeTempDir(),
    { DOMAIN: "ritaj.app" },
    (line) => lines.push(line),
  );

  assertEquals(
    lines[0],
    "args: deploy web compose --artifacts published --version 1.2.3",
  );
  assertEquals(lines.includes("DOMAIN=ritaj.app"), true);
  assertEquals(lines.includes("HOME=/home/platform"), true);
  assertEquals(lines.includes("to stderr"), true);
  assertEquals(lines.some((line) => line.includes("never-pass-me")), false);
});

Deno.test("Ensemble: another environment is an instance, and a plan only plans", async () => {
  const lines: string[] = [];
  await new Ensemble(await fakeEns(), RELEASER, host).deploy(
    deployment({ environment: "staging", termination: "plan" }),
    await Deno.makeTempDir(),
    {},
    (line) => lines.push(line),
  );
  assertEquals(
    lines[0],
    "args: deploy web compose --artifacts published --version 1.2.3 --instance staging --plan",
  );
});

Deno.test("Ensemble: a non-zero exit fails", async () => {
  const ens = await fakeEns();
  await assertRejects(
    () =>
      new Ensemble(ens, RELEASER, host).deploy(
        deployment(),
        Deno.cwd(),
        { EXIT: "3" },
        () => {},
      ),
    CommandFailedError,
    "code 3",
  );
});

Deno.test("Ensemble: a release answers yes, publishes with the project's credentials, and commits and pushes as the releaser", async () => {
  const lines: string[] = [];
  await new Ensemble(await fakeEns(), RELEASER, host).release(
    Platform.Release.create({
      project: "portal",
      action: "next",
      argument: "patch",
    }),
    await Deno.makeTempDir(),
    { JSR_TOKEN: "jsr" },
    (line) => lines.push(line),
  );

  assertEquals(lines[0], "args: release next patch --yes");
  assertEquals(lines.includes("JSR_TOKEN=jsr"), true);
  assertEquals(lines.includes("GIT_AUTHOR_NAME=ensemble platform"), true);
  assertEquals(
    lines.includes("GIT_COMMITTER_EMAIL=platform@example.com"),
    true,
  );
  assertEquals(
    lines.includes("GIT_CONFIG_KEY_0=http.https://github.com/.extraheader"),
    true,
  );
});
