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

Deno.test("WorkloadReleaseLocator.locate: development mode uses the local outputName tag", () => {
  const locator = new WorkloadReleaseLocator(workload, "1.4.2");
  assertEquals(locator.locate("worker", "development"), {
    kind: "image",
    ref: "worker-ship:latest",
  });
});

Deno.test("WorkloadReleaseLocator.locate: development mode falls back to the release name with no outputName", () => {
  const locator = new WorkloadReleaseLocator(workload, "1.4.2");
  assertEquals(locator.locate("web", "development"), {
    kind: "image",
    ref: "web:latest",
  });
});

Deno.test("WorkloadReleaseLocator.locate: production mode uses the published name and given version", () => {
  const locator = new WorkloadReleaseLocator(workload, "1.4.2");
  assertEquals(locator.locate("web", "production"), {
    kind: "image",
    ref: "registry.ritaj.app/web:1.4.2",
  });
});

Deno.test("WorkloadReleaseLocator.locate: production mode falls back to outputName/name with no publish block", () => {
  const locator = new WorkloadReleaseLocator(workload, "1.4.2");
  assertEquals(locator.locate("worker", "production"), {
    kind: "image",
    ref: "worker-ship:1.4.2",
  });
});

Deno.test("WorkloadReleaseLocator.locate: throws for an undeclared release", () => {
  const locator = new WorkloadReleaseLocator(workload, "1.4.2");
  assertThrows(
    () => locator.locate("ghost", "production"),
    UnknownReleaseError,
  );
});
