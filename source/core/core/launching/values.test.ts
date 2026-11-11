import { assertEquals, assertThrows } from "@std/assert";
import type { LaunchEntry } from "../deploy/launch.ts";
import { PortAllocator } from "./ports.ts";
import { ValueError, Values } from "./values.ts";

const LOCATIONS = {
  build: (app: string) => `/out/${app}`,
  pack: (ship: string) => `/pkg/${ship}`,
};

function entry(
  partial: Partial<LaunchEntry> & Pick<LaunchEntry, "type">,
): LaunchEntry {
  return { ports: {}, env: {}, envSecrets: {}, ...partial };
}

Deno.test("auto ports are free, fixed ports are kept, each entry's names are separate", () => {
  const ports = new PortAllocator().assign({
    kernel: entry({
      type: "process",
      command: ["k"],
      ports: { http: "auto", admin: 9000 },
    }),
  });
  assertEquals(ports.get("kernel.admin"), 9000);
  const http = ports.get("kernel.http")!;
  assertEquals(http > 0 && http < 65536, true);
});

Deno.test("builds, packs, ports and secrets are filled in", () => {
  const entries = {
    kernel: entry({
      type: "process",
      command: ["${build.kernel}/run"],
      ports: { http: 4000 },
    }),
    desktop: entry({
      type: "desktop",
      package: "${pack.desktop}",
      env: { URL: "http://127.0.0.1:${launch.kernel.http}" },
      envSecrets: { TOKEN: "kernel-access-token" },
    }),
  };
  const values = new Values(
    LOCATIONS,
    new PortAllocator().assign(entries),
    (name) => name === "KERNEL_ACCESS_TOKEN" ? "s3cret" : undefined,
  );

  assertEquals(values.runnable("kernel", entries.kernel).argv, [
    "/out/kernel/run",
  ]);
  assertEquals(values.runnable("kernel", entries.kernel).ports, { http: 4000 });
  const desktop = values.runnable("desktop", entries.desktop);
  assertEquals(desktop.argv, ["/pkg/desktop"]);
  assertEquals(desktop.env, { URL: "http://127.0.0.1:4000", TOKEN: "s3cret" });
});

Deno.test("a missing secret says which variable to set", () => {
  const entries = {
    a: entry({ type: "process", command: ["a"], envSecrets: { T: "api-key" } }),
  };
  const values = new Values(LOCATIONS, new Map(), () => undefined);
  assertThrows(
    () => values.runnable("a", entries.a),
    ValueError,
    "set API_KEY",
  );
});

Deno.test("a deploy resource reference is refused for now, with the reference named", () => {
  const entries = {
    a: entry({ type: "process", command: ["a", "${variables.x.value}"] }),
  };
  const values = new Values(LOCATIONS, new Map());
  assertThrows(
    () => values.runnable("a", entries.a),
    ValueError,
    "${variables.x.value}",
  );
});
