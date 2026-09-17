import { assertEquals, assertRejects } from "@std/assert";
import type { Kit } from "../kit/kit.ts";
import type { Workload } from "../workload.ts";
import {
  EmulateExternalsNotSupportedError,
  ExternalsEmulationError,
  ExternalsEmulator,
} from "./externals-emulator.ts";

const WORKLOAD: Workload = {
  external: { "edge-net": { type: "network", name: "edge-net" } },
};

function kitWith(emulateExternals?: Kit["emulateExternals"]): Kit {
  return {
    provisioners: () => Promise.resolve([]),
    realization: () =>
      Promise.resolve({
        classPreset: () => Promise.resolve(undefined),
        defaultFor: () => Promise.resolve(undefined),
        boundFor: () => Promise.resolve(undefined),
        supportsCapability: () => Promise.resolve(false),
        knowabilityOf: () => Promise.resolve("static" as const),
      }),
    present: () => Promise.resolve({ filename: "x", content: "" }),
    applyCommand: () => Promise.resolve(["true"]),
    ...(emulateExternals ? { emulateExternals } : {}),
  };
}

Deno.test("ExternalsEmulator.emulate: throws when the kit has no emulation hook at all", async () => {
  const emulator = new ExternalsEmulator();
  await assertRejects(
    () => emulator.emulate(WORKLOAD, kitWith()),
    EmulateExternalsNotSupportedError,
  );
});

Deno.test("ExternalsEmulator.emulate: skips create when check already succeeds (idempotent)", async () => {
  // create is a command that would fail if it ever actually ran — this test
  // passes only because check succeeding skips it entirely.
  const kit = kitWith(() =>
    Promise.resolve([
      { name: "edge-net", check: ["true"], create: ["false"] },
    ])
  );

  const emulator = new ExternalsEmulator();
  await emulator.emulate(WORKLOAD, kit);
});

Deno.test("ExternalsEmulator.emulate: runs create when check fails, and succeeds when create does", async () => {
  const kit = kitWith(() =>
    Promise.resolve([
      { name: "edge-net", check: ["false"], create: ["true"] },
    ])
  );

  const emulator = new ExternalsEmulator();
  await emulator.emulate(WORKLOAD, kit); // no throw
});

Deno.test("ExternalsEmulator.emulate: throws ExternalsEmulationError naming the entry when create also fails", async () => {
  const kit = kitWith(() =>
    Promise.resolve([
      { name: "edge-net", check: ["false"], create: ["false"] },
    ])
  );

  const emulator = new ExternalsEmulator();
  const error = await assertRejects(
    () => emulator.emulate(WORKLOAD, kit),
    ExternalsEmulationError,
  );
  assertEquals(
    error.message,
    'Failed to bring up "external.edge-net" (command: false).',
  );
});

Deno.test("ExternalsEmulator.emulate: a later entry still runs create even when an earlier one's check already succeeded", async () => {
  const kit = kitWith(() =>
    Promise.resolve([
      { name: "edge-net", check: ["true"], create: ["false"] },
      { name: "backend-net", check: ["false"], create: ["true"] },
    ])
  );

  const emulator = new ExternalsEmulator();
  await emulator.emulate(WORKLOAD, kit); // no throw: first skips create, second's create succeeds
});

Deno.test("ExternalsEmulator.emulate: a failure on a later entry still names that entry, not an earlier one", async () => {
  const kit = kitWith(() =>
    Promise.resolve([
      { name: "edge-net", check: ["true"], create: ["false"] },
      { name: "backend-net", check: ["false"], create: ["false"] },
    ])
  );

  const emulator = new ExternalsEmulator();
  const error = await assertRejects(
    () => emulator.emulate(WORKLOAD, kit),
    ExternalsEmulationError,
  );
  assertEquals(
    error.message,
    'Failed to bring up "external.backend-net" (command: false).',
  );
});
