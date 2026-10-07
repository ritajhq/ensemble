import { assertEquals, assertRejects } from "@std/assert";
import * as KitSdk from "@ensemble/kit-sdk";
import { containerOrchestratedProvisioner } from "./provisioners/container-orchestrated.ts";

async function environment(
  params: Record<string, unknown>,
  mode: KitSdk.Deploy.Mode,
): Promise<Record<string, string>> {
  const outcome = await containerOrchestratedProvisioner().provision!({
    category: "compute",
    name: "web",
    type: "container-orchestrated",
    params: { image: "web:dev", ...params },
    values: {},
    secrets: {},
    mode,
  });
  return (outcome.fragment.content as {
    service: { environment: Record<string, string> };
  }).service.environment;
}

const PARAMS = {
  env: { BASE_URL: "/" },
  development: { env: { LIVE_RELOAD: true } },
};

Deno.test("compose kit: under ens develop, development.env adds to a compute's environment", async () => {
  assertEquals(await environment(PARAMS, "development"), {
    BASE_URL: "/",
    LIVE_RELOAD: "true",
  });
});

Deno.test("compose kit: under ens deploy, development.env adds nothing", async () => {
  assertEquals(await environment(PARAMS, "deployment"), { BASE_URL: "/" });
});

Deno.test("compose kit: development.env naming a variable env already sets is rejected in either mode", async () => {
  const params = {
    env: { LIVE_RELOAD: "false" },
    development: { env: { LIVE_RELOAD: true } },
  };
  for (const mode of ["development", "deployment"] as const) {
    await assertRejects(
      () => environment(params, mode),
      Error,
      "development.env may only add variables, but LIVE_RELOAD",
    );
  }
});
