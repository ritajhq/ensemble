import { assertEquals } from "@std/assert";
import * as KitSdk from "@ensemble/kit-sdk";
import { gatewayProvisioner } from "./gateway.ts";
import { ROUTES_METADATA } from "../routes-metadata.ts";

function request(routes: unknown): KitSdk.Deploy.ResolvedRequest {
  return {
    category: "networking",
    name: "gateway",
    type: "gateway",
    params: { routes },
    values: {},
    secrets: {},
  };
}

Deno.test("aws gateway: the distribution records each route target with its paths, in declaration order", async () => {
  const outcome = await gatewayProvisioner().provision!(request([
    { path: "/v1/*", target: { service: "api" } },
    { path: "/admin/*", target: { service: "api" } },
    { path: "/*", target: { storage: "site" } },
  ]));
  const distribution = (outcome.fragment.content as {
    resources: Record<string, { Metadata?: Record<string, unknown> }>;
  }).resources.Gateway;

  assertEquals(distribution.Metadata, {
    [ROUTES_METADATA]: [
      { service: "api", paths: ["/v1/*", "/admin/*"] },
      { service: "site", paths: ["/*"] },
    ],
  });
});
