import { assertEquals, assertStringIncludes } from "@std/assert";
import { ROLES } from "@ensemble/core/kit-roles";
import * as Core from "@ensemble/core";

const SOURCES = ["commands.ts", "project/nodes.ts", "status.ts"];

Deno.test("extension: kit roles come from the one list `ens status` uses", async () => {
  assertEquals(ROLES, Core.Vendor.KitManifest.ROLES);
  for (const source of SOURCES) {
    const text = await Deno.readTextFile(new URL(source, import.meta.url));
    assertStringIncludes(text, "@ensemble/core/kit-roles");
    assertEquals(
      /"build",\s*"pack"/.test(text) || /"build"\s*\|\s*"pack"/.test(text),
      false,
      `${source} spells out a list of kit roles of its own`,
    );
  }
});
