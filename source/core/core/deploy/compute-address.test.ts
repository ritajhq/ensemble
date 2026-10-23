import { assertEquals } from "@std/assert";
import { Parser } from "./manifest/parser.ts";
import { ComputeAddress } from "./compute-address.ts";

const workload = new Parser().parse(`
version: v1
deploy:
  compute:
    judge:
      type: container
      image: judge
      replicas: 1
      ports:
        http: 8081
`);

const reference = (output: string) => ({
  category: "compute",
  name: "judge",
  output,
});

Deno.test("ComputeAddress: a compute's host and its declared ports are addresses", () => {
  assertEquals(ComputeAddress.names(reference("host"), workload), true);
  assertEquals(ComputeAddress.names(reference("http"), workload), true);
});

Deno.test("ComputeAddress: anything else about a compute is not", () => {
  assertEquals(ComputeAddress.names(reference("metrics"), workload), false);
  assertEquals(
    ComputeAddress.names(
      { category: "storage", name: "judge", output: "host" },
      workload,
    ),
    false,
  );
});

Deno.test("ComputeAddress: a declared port is the manifest's own number", () => {
  assertEquals(ComputeAddress.port(reference("http"), workload), 8081);
  assertEquals(ComputeAddress.port(reference("host"), workload), undefined);
});
