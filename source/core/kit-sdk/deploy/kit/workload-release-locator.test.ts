import { assertEquals, assertThrows } from "@std/assert";
import type { Workload } from "../workload.ts";
import {
  UnknownReleaseError,
  WorkloadReleaseLocator,
} from "./release-locator.ts";

const workload: Workload = {
  release: {
    web: {
      kit: "docker",
      publish: { target: "push", name: "registry.ritaj.app/web", options: {} },
    },
    worker: { kit: "docker", outputName: "worker-ship" },
  },
};

Deno.test("WorkloadReleaseLocator.locate: local artifacts use the local outputName tag", () => {
  const locator = new WorkloadReleaseLocator(workload, "1.4.2");
  assertEquals(locator.locate("worker", "local"), {
    ref: "worker-ship:latest",
  });
});

Deno.test("WorkloadReleaseLocator.locate: local artifacts fall back to the release name with no outputName", () => {
  const locator = new WorkloadReleaseLocator(workload, "1.4.2");
  assertEquals(locator.locate("web", "local"), {
    ref: "web:latest",
  });
});

Deno.test("WorkloadReleaseLocator.locate: published artifacts use the published name and given version", () => {
  const locator = new WorkloadReleaseLocator(workload, "1.4.2");
  assertEquals(locator.locate("web", "published"), {
    ref: "registry.ritaj.app/web:1.4.2",
  });
});

Deno.test("WorkloadReleaseLocator.locate: published artifacts fall back to outputName/name with no publish block", () => {
  const locator = new WorkloadReleaseLocator(workload, "1.4.2");
  assertEquals(locator.locate("worker", "published"), {
    ref: "worker-ship:1.4.2",
  });
});

Deno.test("WorkloadReleaseLocator.locate: throws for an undeclared release", () => {
  const locator = new WorkloadReleaseLocator(workload, "1.4.2");
  assertThrows(
    () => locator.locate("ghost", "published"),
    UnknownReleaseError,
  );
});
