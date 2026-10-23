import { assertEquals, assertRejects } from "@std/assert";
import { Parser } from "../manifest/parser.ts";
import type { Realization } from "../kit/realization.ts";
import { FakeRealization } from "../resolve/test-fakes.ts";
import { ComputeAddressError, ComputeAddresses } from "./compute-addresses.ts";

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

const host = { category: "compute", name: "judge", output: "host" };

class HostingRealization extends FakeRealization {
  hostOf(
    _category: string,
    _type: string,
    name: string,
    deployment: string,
  ): Promise<string | undefined> {
    return Promise.resolve(`${deployment}.${name}`);
  }
}

Deno.test("ComputeAddresses: a port comes from the manifest, the host from the kit and the deployment's name", async () => {
  const addresses = new ComputeAddresses(
    new HostingRealization() as Realization,
    "shop",
  );
  assertEquals(
    await addresses.resolve({ ...host, output: "http" }, workload),
    8081,
  );
  assertEquals(await addresses.resolve(host, workload), "shop.judge");
});

Deno.test("ComputeAddresses: a kit with no host for the compute says so", async () => {
  const addresses = new ComputeAddresses(new FakeRealization(), "shop");
  await assertRejects(
    () => addresses.resolve(host, workload),
    ComputeAddressError,
    "compute.judge.host can't be resolved",
  );
});

Deno.test("ComputeAddresses: with no deployment there is no host to give", async () => {
  const addresses = new ComputeAddresses(
    new HostingRealization() as Realization,
  );
  await assertRejects(
    () => addresses.resolve(host, workload),
    ComputeAddressError,
  );
});
