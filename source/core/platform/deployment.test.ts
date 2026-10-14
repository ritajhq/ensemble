import { assertEquals, assertThrows } from "@std/assert";
import { Deployment, InvalidDeploymentError } from "./deployment.ts";
import { Run } from "./run.ts";
import { InvalidReleaseError, Release } from "./release.ts";

const fields = {
  project: "portal",
  manifest: "portal",
  environment: "production",
  kit: "compose",
  version: "1.4.2",
  termination: "apply",
};

Deno.test("Deployment: production is the manifest's plain deployment, any other environment an instance named after it", () => {
  assertEquals(Deployment.create(fields).instance, undefined);
  assertEquals(
    Deployment.create({ ...fields, environment: "staging" }).instance,
    "staging",
  );
});

Deno.test("Deployment: nothing in it reads as an option, and it only plans or applies", () => {
  for (
    const bad of [
      { kit: "--rm" },
      { version: "-x" },
      { version: "" },
      { termination: "destroy" },
    ]
  ) {
    assertThrows(
      () => Deployment.create({ ...fields, ...bad }),
      InvalidDeploymentError,
    );
  }
  assertEquals(
    Deployment.create({ ...fields, version: "latest" }).version,
    "latest",
  );
});

Deno.test("Run: moves from queued to running to an outcome, keeping what it was", () => {
  const queued = Run.queue(Deployment.create(fields), new Date(0));
  const running = queued.start("abc123", new Date(1000));
  const failed = running.fail("exit 1", new Date(2000));

  assertEquals(queued.state, "queued");
  assertEquals(running.state, "running");
  assertEquals(running.commit, "abc123");
  assertEquals(failed.state, "failed");
  assertEquals(failed.error, "exit 1");
  assertEquals(failed.id, queued.id);
  assertEquals(failed.queuedAt, new Date(0).toISOString());
  assertEquals(failed.startedAt, new Date(1000).toISOString());
});

Deno.test("Release: next bumps, set names a version, resume finishes a tag", () => {
  assertEquals(
    Release.create({ project: "portal", action: "next", argument: "minor" })
      .argument,
    "minor",
  );
  Release.create({ project: "portal", action: "set", argument: "2.0.0" });
  Release.create({ project: "portal", action: "resume", argument: "v1.4.2" });
  for (
    const bad of [
      { action: "next", argument: "huge" },
      { action: "set", argument: "2.0" },
      { action: "resume", argument: "--force" },
      { action: "undo", argument: "" },
    ]
  ) {
    assertThrows(
      () => Release.create({ project: "portal", ...bad }),
      InvalidReleaseError,
    );
  }
});
