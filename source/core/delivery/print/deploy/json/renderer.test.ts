import { assertEquals } from "@std/assert";
import { shopArchitecture } from "../shop-architecture.ts";
import { Renderer } from "./renderer.ts";

Deno.test("renderer: hands the architecture back as text and writes nothing", async () => {
  const rendering = await new Renderer().render("shop", shopArchitecture());

  assertEquals(rendering.written, []);
  assertEquals(
    JSON.parse(rendering.stdout!).entries.length,
    shopArchitecture().entries.length,
  );
});
