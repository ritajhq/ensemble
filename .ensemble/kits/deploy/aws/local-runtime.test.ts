import { assertEquals } from "@std/assert";
import { LocalRuntime } from "./local-runtime.ts";

function runtimeAt(endpoint: string, edgePort?: string): LocalRuntime {
  const environment = new Map([["AWS_ENDPOINT_URL", endpoint]]);
  if (edgePort) environment.set("EDGE_PORT", edgePort);
  return LocalRuntime.of(environment as unknown as Deno.Env)!;
}

Deno.test("LocalRuntime: MiniStack's API and CloudFront entrance bind to loopback only", () => {
  assertEquals(runtimeAt("http://localhost:4566").publications, [
    "-p",
    "127.0.0.1:4566:4566",
    "-p",
    "127.0.0.1:8080:8080",
  ]);
});

Deno.test("LocalRuntime: the endpoint's port and EDGE_PORT choose the host ports", () => {
  assertEquals(runtimeAt("http://localhost:4570", "8081").publications, [
    "-p",
    "127.0.0.1:4570:4566",
    "-p",
    "127.0.0.1:8081:8080",
  ]);
});
