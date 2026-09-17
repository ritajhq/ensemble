import { assertEquals, assertRejects } from "@std/assert";
import { Parser } from "../manifest/parser.ts";
import { ContractError } from "../contracts/errors.ts";
import { ContractCatalog } from "../contracts/registry.ts";
import { containerOrchestratedV1 } from "../contracts/seeds/container-orchestrated.ts";
import { relationalV1 } from "../contracts/seeds/relational.ts";
import { ReferenceResolver } from "../render/reference-resolver.ts";
import { Renderer } from "../render/renderer.ts";
import { StubReleaseLocator } from "../kit/release-locator.ts";
import type { PackKitGateway } from "../kit/pack-kit-gateway.ts";
import type { Kit } from "../kit/kit.ts";
import type { Target } from "../kit/target.ts";
import { FakeRealization } from "../resolve/test-fakes.ts";
import {
  CapabilityGapError,
  DeploymentCoordinator,
} from "./deployment-coordinator.ts";
import {
  ReleaseAvailabilityError,
  ReleaseAvailabilityPreflight,
} from "./release-availability-preflight.ts";
import {
  LocalArtifactsPacker,
  type ReleasePacker,
  ReleasePackError,
} from "./release-packer.ts";
import { WatchNotSupportedError, WatchRunner } from "./watch-runner.ts";
import {
  EmulateExternalsNotSupportedError,
  ExternalsEmulationError,
  ExternalsEmulator,
} from "./externals-emulator.ts";
import { Ejector } from "./ejector.ts";
import { Planner } from "./planner.ts";
import { Applier } from "./applier.ts";
import { FakeArtifactSink, FakeRenderCache } from "./test-fakes.ts";

const APPENDIX_A = `
version: v1
release:
  web: { kit: docker }
deploy:
  compute:
    api:
      type: container-orchestrated
      image: \${release.web}
      replicas: 2
      env:
        DATABASE_URL: \${databases.primary.url}
  databases:
    primary:
      type: relational
      class: critical
      engine: postgres
      version: "16"
      user: appuser
      database: appdb
      passwordSecret: db-password
  secrets:
    db-password: { source: environment }
`;

const registry = new ContractCatalog([relationalV1, containerOrchestratedV1]);
const realization = new FakeRealization();

/** None of the eject/plan/local-apply tests below ever reach the published-apply-only availability preflight, so this default gateway's `verify` is never actually invoked — only present to satisfy the constructor. */
const alwaysAvailableGateway: PackKitGateway = {
  describe: () => Promise.reject(new Error("describe() not used in this test")),
  verify: () => Promise.resolve({ available: true }),
};

/** Default packer for tests that don't care about packing itself — every local apply below goes through this unless a test builds its own coordinator with a different one. */
const alwaysSucceedsPacker: ReleasePacker = {
  pack: () => Promise.resolve(),
};

/** A minimal fake `Kit` with real (if trivial) provisioners, so the coordinator's full deploy() pipeline can actually render something, plus `present`/`applyCommand` so eject/plan/apply have somewhere to go. `watchCommand` is only present when `watchCommand` is given — `undefined` (the parameter's own default) means this fake, like aws today, simply can't watch. */
function fakeKit(
  presentedContent: string,
  applyCommand: readonly string[] = ["true"],
  watchCommand?: readonly string[],
  emulateExternals?: Kit["emulateExternals"],
): Kit {
  return {
    provisioners: () =>
      Promise.resolve([
        {
          matches: (resource) =>
            Promise.resolve(resource.declaration.type === "relational"),
          provision: (request) =>
            Promise.resolve({
              fragment: {
                category: request.category,
                name: request.name,
                content: {},
              },
              outputs: {
                host: request.name,
                port: 5432,
                user: request.params.user,
                database: request.params.database,
                url: "u",
              },
            }),
        },
        {
          matches: (resource) =>
            Promise.resolve(
              resource.declaration.type === "container-orchestrated",
            ),
          provision: (request) =>
            Promise.resolve({
              fragment: {
                category: request.category,
                name: request.name,
                content: {},
              },
              outputs: {},
            }),
        },
      ]),
    realization: () => Promise.resolve(realization),
    present: () =>
      Promise.resolve({ filename: "compose.yaml", content: presentedContent }),
    applyCommand: (path) => Promise.resolve([...applyCommand, path]),
    ...(watchCommand
      ? { watchCommand: (path: string) => Promise.resolve([...watchCommand, path]) }
      : {}),
    ...(emulateExternals ? { emulateExternals } : {}),
  };
}

async function buildCoordinator(
  kit: Kit,
  sink: FakeArtifactSink,
  cache: FakeRenderCache,
  gateway: PackKitGateway = alwaysAvailableGateway,
  packer: ReleasePacker = alwaysSucceedsPacker,
) {
  const releaseLocator = new StubReleaseLocator({
    local: { web: { ref: "ens-local/web:dev" } },
    published: { web: { ref: "registry.ritaj.app/web:1.4.2" } },
  });
  const renderer = new Renderer(
    new ReferenceResolver(await kit.realization()),
    releaseLocator,
    registry,
  );
  return new DeploymentCoordinator(
    registry,
    renderer,
    new Ejector(sink),
    new Planner(cache),
    new Applier(sink, cache),
    new ReleaseAvailabilityPreflight(gateway),
    new LocalArtifactsPacker(packer),
    new WatchRunner(sink),
    new ExternalsEmulator(),
  );
}

async function deployAppendixA(
  kit: Kit,
  termination: "eject" | "plan" | "apply",
  acceptCapabilityGaps = false,
  manifest = APPENDIX_A,
) {
  const workload = new Parser().parse(manifest);
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();
  const coordinator = await buildCoordinator(kit, sink, cache);
  const target: Target = { kit };
  const result = await coordinator.deploy("phase6-test", workload, target, {
    artifacts: "local",
    termination,
    acceptCapabilityGaps,
    version: "1.4.2",
    pack: true,
    watch: false,
    emulateExternals: false,
  });
  return { result, sink, cache };
}

Deno.test("DeploymentCoordinator.deploy: eject presents the render and writes it via the sink", async () => {
  const { result, sink } = await deployAppendixA(
    fakeKit("ejected content"),
    "eject",
  );

  assertEquals(result, {
    termination: "eject",
    artifact: { filename: "compose.yaml", content: "ejected content" },
    gaps: [],
  });
  assertEquals(sink.written, [{
    filename: "compose.yaml",
    content: "ejected content",
  }]);
});

Deno.test("DeploymentCoordinator.deploy: plan reports the intent-diff and caches the render", async () => {
  const { result, cache } = await deployAppendixA(
    fakeKit("planned content"),
    "plan",
  );

  assertEquals(result.termination, "plan");
  assertEquals(await cache.readLast(), "planned content");
});

Deno.test("DeploymentCoordinator.deploy: apply runs the kit's apply command and updates the cache", async () => {
  const { cache } = await deployAppendixA(fakeKit("applied content"), "apply");

  assertEquals(await cache.readLast(), "applied content");
});

Deno.test("DeploymentCoordinator.deploy: a capability gap hard-fails by default", async () => {
  const manifest = APPENDIX_A.replace(
    "class: critical",
    "class: critical\n      capabilities: { read-replicas: 2 }",
  );

  await assertRejects(
    () => deployAppendixA(fakeKit("x"), "eject", false, manifest),
    CapabilityGapError,
  );
});

Deno.test("DeploymentCoordinator.deploy: acceptCapabilityGaps lets a gap through and reports it in the result", async () => {
  const manifest = APPENDIX_A.replace(
    "class: critical",
    "class: critical\n      capabilities: { read-replicas: 2 }",
  );

  const { result } = await deployAppendixA(
    fakeKit("x"),
    "eject",
    true,
    manifest,
  );

  assertEquals(result.gaps, [{
    resource: "databases.primary",
    gap: { capability: "read-replicas", requested: 2 },
  }]);
});

Deno.test("DeploymentCoordinator.deploy: a reference to an undeclared output fails before any resolution or rendering work", async () => {
  const manifest = APPENDIX_A.replace(
    "DATABASE_URL: ${databases.primary.url}",
    "DATABASE_URL: ${databases.primary.bogus}",
  );

  await assertRejects(
    () => deployAppendixA(fakeKit("x"), "eject", false, manifest),
    ContractError,
    'references undeclared output "bogus"',
  );
});

Deno.test("DeploymentCoordinator.deploy: a reference to an undeclared release fails before any resolution or rendering work", async () => {
  const manifest = APPENDIX_A.replace(
    "image: ${release.web}",
    "image: ${release.ghost}",
  );

  await assertRejects(
    () => deployAppendixA(fakeKit("x"), "eject", false, manifest),
    ContractError,
    'references undeclared release "ghost"',
  );
});

Deno.test("DeploymentCoordinator.deploy: a published apply fails when the availability preflight reports a release unavailable", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit("applied content");
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();
  const unavailableGateway: PackKitGateway = {
    describe: () =>
      Promise.reject(new Error("describe() not used in this test")),
    verify: () =>
      Promise.resolve({ available: false, detail: "not found in registry" }),
  };
  const coordinator = await buildCoordinator(kit, sink, cache, unavailableGateway);
  const target: Target = { kit };

  await assertRejects(
    () =>
      coordinator.deploy("phase-preflight-test", workload, target, {
        artifacts: "published",
        termination: "apply",
        acceptCapabilityGaps: false,
        version: "1.4.2",
        pack: true,
        watch: false,
        emulateExternals: false,
      }),
    ReleaseAvailabilityError,
    "web: not found in registry",
  );
});

Deno.test("DeploymentCoordinator.deploy: the availability preflight never runs for eject/plan or a local apply", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit("x");
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();
  let verifyCalls = 0;
  const countingGateway: PackKitGateway = {
    describe: () =>
      Promise.reject(new Error("describe() not used in this test")),
    verify: () => {
      verifyCalls++;
      return Promise.resolve({ available: false });
    },
  };
  const coordinator = await buildCoordinator(kit, sink, cache, countingGateway);
  const target: Target = { kit };
  const baseOptions = {
    acceptCapabilityGaps: false,
    version: "1.4.2",
    pack: true,
    watch: false,
    emulateExternals: false,
  } as const;

  await coordinator.deploy("t", workload, target, {
    ...baseOptions,
    artifacts: "published",
    termination: "eject",
  });
  await coordinator.deploy("t", workload, target, {
    ...baseOptions,
    artifacts: "published",
    termination: "plan",
  });
  await coordinator.deploy("t", workload, target, {
    ...baseOptions,
    artifacts: "local",
    termination: "apply",
  });

  assertEquals(verifyCalls, 0);
});

const TWO_COMPUTES_ONE_RELEASE = `
version: v1
release:
  web: { kit: docker }
deploy:
  compute:
    api:
      type: container-orchestrated
      image: \${release.web}
      replicas: 2
    worker:
      type: container-orchestrated
      image: \${release.web}
      replicas: 1
  databases:
    primary:
      type: relational
      class: critical
      engine: postgres
      version: "16"
      user: appuser
      database: appdb
      passwordSecret: db-password
  secrets:
    db-password: { source: environment }
`;

Deno.test("DeploymentCoordinator.deploy: a local apply packs each referenced release exactly once, even when multiple resources reference it", async () => {
  const workload = new Parser().parse(TWO_COMPUTES_ONE_RELEASE);
  const kit = fakeKit("applied content");
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();
  const packedNames: string[] = [];
  const packer: ReleasePacker = {
    pack: (name) => {
      packedNames.push(name);
      return Promise.resolve();
    },
  };
  const coordinator = await buildCoordinator(
    kit,
    sink,
    cache,
    alwaysAvailableGateway,
    packer,
  );
  const target: Target = { kit };

  await coordinator.deploy("t", workload, target, {
    artifacts: "local",
    termination: "apply",
    acceptCapabilityGaps: false,
    version: "1.4.2",
    pack: true,
    watch: false,
    emulateExternals: false,
  });

  assertEquals(packedNames, ["web"]);
});

Deno.test("DeploymentCoordinator.deploy: pack: false skips packing for a local apply", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit("x");
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();
  let packCalls = 0;
  const packer: ReleasePacker = {
    pack: () => {
      packCalls++;
      return Promise.resolve();
    },
  };
  const coordinator = await buildCoordinator(
    kit,
    sink,
    cache,
    alwaysAvailableGateway,
    packer,
  );
  const target: Target = { kit };

  await coordinator.deploy("t", workload, target, {
    artifacts: "local",
    termination: "apply",
    acceptCapabilityGaps: false,
    version: "1.4.2",
    pack: false,
    watch: false,
    emulateExternals: false,
  });

  assertEquals(packCalls, 0);
});

Deno.test("DeploymentCoordinator.deploy: a published apply never packs, even with pack: true", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit("x");
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();
  let packCalls = 0;
  const packer: ReleasePacker = {
    pack: () => {
      packCalls++;
      return Promise.resolve();
    },
  };
  const coordinator = await buildCoordinator(
    kit,
    sink,
    cache,
    alwaysAvailableGateway,
    packer,
  );
  const target: Target = { kit };

  await coordinator.deploy("t", workload, target, {
    artifacts: "published",
    termination: "apply",
    acceptCapabilityGaps: false,
    version: "1.4.2",
    pack: true,
    watch: false,
    emulateExternals: false,
  });

  assertEquals(packCalls, 0);
});

Deno.test("DeploymentCoordinator.deploy: eject/plan never pack, even for local artifacts with pack: true", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit("x");
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();
  let packCalls = 0;
  const packer: ReleasePacker = {
    pack: () => {
      packCalls++;
      return Promise.resolve();
    },
  };
  const coordinator = await buildCoordinator(
    kit,
    sink,
    cache,
    alwaysAvailableGateway,
    packer,
  );
  const target: Target = { kit };
  const baseOptions = {
    artifacts: "local",
    acceptCapabilityGaps: false,
    version: "1.4.2",
    pack: true,
    watch: false,
    emulateExternals: false,
  } as const;

  await coordinator.deploy("t", workload, target, {
    ...baseOptions,
    termination: "eject",
  });
  await coordinator.deploy("t", workload, target, {
    ...baseOptions,
    termination: "plan",
  });

  assertEquals(packCalls, 0);
});

Deno.test("DeploymentCoordinator.deploy: a pack failure aborts before the terminal step runs", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit("applied content");
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();
  const failingPacker: ReleasePacker = {
    pack: (name) =>
      Promise.reject(new ReleasePackError(name, `packing "${name}" failed`)),
  };
  const coordinator = await buildCoordinator(
    kit,
    sink,
    cache,
    alwaysAvailableGateway,
    failingPacker,
  );
  const target: Target = { kit };

  await assertRejects(
    () =>
      coordinator.deploy("t", workload, target, {
        artifacts: "local",
        termination: "apply",
        acceptCapabilityGaps: false,
        version: "1.4.2",
        pack: true,
        watch: false,
        emulateExternals: false,
      }),
    ReleasePackError,
    'packing "web" failed',
  );
  assertEquals(sink.written, []);
});

Deno.test("DeploymentCoordinator.deploy: --watch runs the kit's watch command instead of a one-shot apply", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit("watched content", ["true"], ["true"]);
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();
  const coordinator = await buildCoordinator(kit, sink, cache);
  const target: Target = { kit };

  const result = await coordinator.deploy("t", workload, target, {
    artifacts: "local",
    termination: "apply",
    acceptCapabilityGaps: false,
    version: "1.4.2",
    pack: true,
    watch: true,
    emulateExternals: false,
  });

  assertEquals(result, { termination: "apply", gaps: [] });
  assertEquals(sink.written, [{
    filename: "compose.yaml",
    content: "watched content",
  }]);
});

Deno.test("DeploymentCoordinator.deploy: --watch against a kit with no watch command throws WatchNotSupportedError", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit("x"); // no watchCommand given — can't watch, like aws today
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();
  const coordinator = await buildCoordinator(kit, sink, cache);
  const target: Target = { kit };

  await assertRejects(
    () =>
      coordinator.deploy("t", workload, target, {
        artifacts: "local",
        termination: "apply",
        acceptCapabilityGaps: false,
        version: "1.4.2",
        pack: true,
        watch: true,
        emulateExternals: false,
      }),
    WatchNotSupportedError,
  );
});

Deno.test("DeploymentCoordinator.deploy: emulateExternals: false never touches the kit's emulation hook", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  let emulateCalls = 0;
  const kit = fakeKit("x", ["true"], undefined, () => {
    emulateCalls++;
    return Promise.resolve([]);
  });
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();
  const coordinator = await buildCoordinator(kit, sink, cache);
  const target: Target = { kit };

  await coordinator.deploy("t", workload, target, {
    artifacts: "local",
    termination: "apply",
    acceptCapabilityGaps: false,
    version: "1.4.2",
    pack: true,
    watch: false,
    emulateExternals: false,
  });

  assertEquals(emulateCalls, 0);
});

Deno.test("DeploymentCoordinator.deploy: emulateExternals: true runs the kit's emulation hook before an apply", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  let emulateCalls = 0;
  const kit = fakeKit("applied content", ["true"], undefined, (w) => {
    emulateCalls++;
    assertEquals(w, workload);
    return Promise.resolve([]);
  });
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();
  const coordinator = await buildCoordinator(kit, sink, cache);
  const target: Target = { kit };

  await coordinator.deploy("t", workload, target, {
    artifacts: "local",
    termination: "apply",
    acceptCapabilityGaps: false,
    version: "1.4.2",
    pack: true,
    watch: false,
    emulateExternals: true,
  });

  assertEquals(emulateCalls, 1);
});

Deno.test("DeploymentCoordinator.deploy: emulateExternals: true against a kit with no emulation hook throws EmulateExternalsNotSupportedError", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit("x"); // no emulateExternals given — can't emulate, like aws today
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();
  const coordinator = await buildCoordinator(kit, sink, cache);
  const target: Target = { kit };

  await assertRejects(
    () =>
      coordinator.deploy("t", workload, target, {
        artifacts: "local",
        termination: "apply",
        acceptCapabilityGaps: false,
        version: "1.4.2",
        pack: true,
        watch: false,
        emulateExternals: true,
      }),
    EmulateExternalsNotSupportedError,
  );
});

Deno.test("DeploymentCoordinator.deploy: a failed emulation aborts before packing or the terminal step run", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit("x", ["true"], undefined, () =>
    Promise.resolve([
      { name: "edge-net", check: ["false"], create: ["false"] },
    ]));
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();
  let packCalls = 0;
  const packer: ReleasePacker = {
    pack: () => {
      packCalls++;
      return Promise.resolve();
    },
  };
  const coordinator = await buildCoordinator(
    kit,
    sink,
    cache,
    alwaysAvailableGateway,
    packer,
  );
  const target: Target = { kit };

  await assertRejects(
    () =>
      coordinator.deploy("t", workload, target, {
        artifacts: "local",
        termination: "apply",
        acceptCapabilityGaps: false,
        version: "1.4.2",
        pack: true,
        watch: false,
        emulateExternals: true,
      }),
    ExternalsEmulationError,
    'Failed to bring up "external.edge-net"',
  );
  assertEquals(packCalls, 0);
  assertEquals(sink.written, []);
});

Deno.test("DeploymentCoordinator.deploy: eject/plan never invoke the emulate-externals step, even with emulateExternals: true", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  // No emulateExternals at all — if the coordinator ever actually tried to
  // emulate here, it would throw EmulateExternalsNotSupportedError and fail.
  const kit = fakeKit("x");
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();
  const coordinator = await buildCoordinator(kit, sink, cache);
  const target: Target = { kit };
  const baseOptions = {
    artifacts: "local",
    acceptCapabilityGaps: false,
    version: "1.4.2",
    pack: true,
    watch: false,
    emulateExternals: true,
  } as const;

  const ejected = await coordinator.deploy("t", workload, target, {
    ...baseOptions,
    termination: "eject",
  });
  const planned = await coordinator.deploy("t", workload, target, {
    ...baseOptions,
    termination: "plan",
  });

  assertEquals(ejected.termination, "eject");
  assertEquals(planned.termination, "plan");
});

Deno.test("DeploymentCoordinator.deploy: eject/plan never invoke the watch step, even with watch: true", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  // No watchCommand at all — if the coordinator ever actually tried to
  // watch here, it would throw WatchNotSupportedError and fail this test.
  const kit = fakeKit("x");
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();
  const coordinator = await buildCoordinator(kit, sink, cache);
  const target: Target = { kit };
  const baseOptions = {
    artifacts: "local",
    acceptCapabilityGaps: false,
    version: "1.4.2",
    pack: true,
    watch: true,
    emulateExternals: false,
  } as const;

  const ejected = await coordinator.deploy("t", workload, target, {
    ...baseOptions,
    termination: "eject",
  });
  const planned = await coordinator.deploy("t", workload, target, {
    ...baseOptions,
    termination: "plan",
  });

  assertEquals(ejected.termination, "eject");
  assertEquals(planned.termination, "plan");
});
