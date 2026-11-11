import { assertEquals, assertThrows } from "@std/assert";
import type { LaunchEntry } from "./launch.ts";
import { LaunchPlan, LaunchPlanError } from "./launch-plan.ts";

const KNOWN = {
  builds: new Set(["kernel", "web"]),
  packs: new Set(["desktop"]),
};

function entry(
  partial: Partial<LaunchEntry> & Pick<LaunchEntry, "type">,
): LaunchEntry {
  return { ports: {}, env: {}, envSecrets: {}, ...partial };
}

const KERNEL = entry({
  type: "process",
  command: ["${build.kernel}/run"],
  ports: { http: "auto" },
  development: { restart: [{ build: "kernel" }] },
});

const DESKTOP = entry({
  type: "desktop",
  package: "${pack.desktop}",
  env: { URL: "http://127.0.0.1:${launch.kernel.http}", WEB: "${build.web}" },
  development: { restart: [{ pack: "desktop" }] },
});

Deno.test("an entry that mentions another's port starts after it", () => {
  const plan = new LaunchPlan({ desktop: DESKTOP, kernel: KERNEL }, KNOWN);
  assertEquals(plan.order(), ["kernel", "desktop"]);
});

Deno.test("entries with no references keep manifest order", () => {
  const a = entry({ type: "process", command: ["a"] });
  const b = entry({ type: "process", command: ["b"] });
  assertEquals(new LaunchPlan({ a, b }, KNOWN).order(), ["a", "b"]);
});

Deno.test("an entry names the builds, packs and launch entries it uses", () => {
  const plan = new LaunchPlan({ kernel: KERNEL, desktop: DESKTOP }, KNOWN);
  assertEquals(plan.usedBy("desktop"), {
    builds: ["web"],
    packs: ["desktop"],
    launches: ["kernel"],
  });
});

Deno.test("deploy resource references are left alone", () => {
  const web = entry({
    type: "process",
    command: ["x", "${variables.port.value}"],
  });
  const plan = new LaunchPlan({ web }, KNOWN);
  assertEquals(plan.usedBy("web"), { builds: [], packs: [], launches: [] });
});

Deno.test("a reference to an unknown build or pack is rejected", () => {
  const bad = entry({ type: "process", command: ["${build.nope}/run"] });
  assertThrows(
    () => new LaunchPlan({ bad }, KNOWN),
    LaunchPlanError,
    "launch.bad refers to build nope",
  );
  const worse = entry({ type: "desktop", package: "${pack.nope}" });
  assertThrows(
    () => new LaunchPlan({ worse }, KNOWN),
    LaunchPlanError,
    "refers to pack nope",
  );
});

Deno.test("a restart rule must name a known build or pack", () => {
  const bad = entry({
    type: "process",
    command: ["x"],
    development: { restart: [{ build: "nope" }] },
  });
  assertThrows(
    () => new LaunchPlan({ bad }, KNOWN),
    LaunchPlanError,
    "restart on build nope",
  );
});

Deno.test("a reference to a launch entry or port that does not exist is rejected", () => {
  const missing = entry({ type: "process", command: ["${launch.ghost.http}"] });
  assertThrows(
    () => new LaunchPlan({ missing }, KNOWN),
    LaunchPlanError,
    "launch.ghost",
  );
  const noPort = entry({
    type: "process",
    command: ["x"],
    env: { P: "${launch.kernel.grpc}" },
  });
  assertThrows(
    () => new LaunchPlan({ kernel: KERNEL, noPort }, KNOWN),
    LaunchPlanError,
    "no port named grpc",
  );
});

Deno.test("an entry cannot depend on itself, directly or through another", () => {
  const a = entry({
    type: "process",
    command: ["${launch.b.p}"],
    ports: { p: 1 },
  });
  const b = entry({
    type: "process",
    command: ["${launch.a.p}"],
    ports: { p: 2 },
  });
  assertThrows(
    () => new LaunchPlan({ a, b }, KNOWN),
    LaunchPlanError,
    "cycle: a -> b -> a",
  );
});

Deno.test("an entry may mention its own port", () => {
  const own = entry({
    type: "process",
    command: ["x"],
    ports: { http: "auto" },
    env: { PORT: "${launch.own.http}" },
  });
  assertEquals(new LaunchPlan({ own }, KNOWN).order(), ["own"]);
});
