import { assertEquals } from "@std/assert";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Vendor } from "@ensemble/core";
import { z } from "zod";
import { KitTools } from "./kit.ts";

/** The schema `KitTools` registers `ensemble_kit_new` with. */
function kitNewSchema(): z.ZodObject<z.ZodRawShape> {
  let schema: z.ZodRawShape = {};
  const server = {
    registerTool(name: string, config: { inputSchema: z.ZodRawShape }) {
      if (name === "ensemble_kit_new") schema = config.inputSchema;
    },
  };
  new KitTools().Register(server as unknown as McpServer);
  return z.object(schema);
}

for (const role of Vendor.KitManifest.ROLES) {
  Deno.test(`ensemble_kit_new: accepts the ${role} role`, () => {
    assertEquals(kitNewSchema().parse({ name: "foo", role }), {
      name: "foo",
      role,
    });
  });
}

Deno.test("ensemble_kit_new: refuses a role that isn't one", () => {
  assertEquals(
    kitNewSchema().safeParse({ name: "foo", role: "nope" }).success,
    false,
  );
});
