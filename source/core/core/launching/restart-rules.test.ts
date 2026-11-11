import { assertEquals } from "@std/assert";
import type { LaunchEntry } from "../deploy/launch.ts";
import { RestartRules } from "./restart-rules.ts";

const base = { ports: {}, env: {}, envSecrets: {} };
const entries: Record<string, LaunchEntry> = {
  kernel: {
    ...base,
    type: "process",
    command: ["k"],
    development: { restart: [{ build: "kernel" }] },
  },
  desktop: {
    ...base,
    type: "desktop",
    package: "p",
    development: { restart: [{ pack: "desktop" }, { build: "kernel" }] },
  },
  other: { ...base, type: "process", command: ["o"] },
};

Deno.test("an output restarts the entries that asked for it, in manifest order", () => {
  const rules = new RestartRules(entries);
  assertEquals(rules.for({ build: "kernel" }), ["kernel", "desktop"]);
  assertEquals(rules.for({ pack: "desktop" }), ["desktop"]);
  assertEquals(rules.for({ build: "web" }), []);
});

Deno.test("lists each watched output once", () => {
  assertEquals(new RestartRules(entries).outputs(), [{ build: "kernel" }, {
    pack: "desktop",
  }]);
});
