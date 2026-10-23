import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { shopArchitecture } from "../shop-architecture.ts";
import { Files } from "./files.ts";
import { Page } from "./page.ts";
import { Renderer } from "./renderer.ts";

Deno.test("page: shows the drawing and lists uses, including of variables", () => {
  const page = new Page().write("shop", "architecture", shopArchitecture());
  assertStringIncludes(page, 'srcset="architecture.svg"');
  assertStringIncludes(page, 'src="architecture-light.svg"');
  assertStringIncludes(page, "`variables.region`");
  assertStringIncludes(page, "| Name | Type | Details | Uses |");
  assertStringIncludes(page, "| Name | Type | Details | Used by |");
});

Deno.test("files: writes the page, both drawings and the source, creating the folder", async () => {
  const root = await Deno.makeTempDir();
  const pagePath = join(root, "docs", "shop", "architecture.md");

  const written = await new Files().write("shop", pagePath, shopArchitecture());

  assertEquals(written.page, pagePath);
  for (
    const file of [
      "architecture.md",
      "architecture.svg",
      "architecture-light.svg",
      "architecture.reladraw",
    ]
  ) {
    assert((await Deno.stat(join(root, "docs", "shop", file))).isFile);
  }
});

Deno.test("renderer: reports the four files it wrote, the page in docs/<name> by default", async () => {
  const root = await Deno.makeTempDir();
  const page = Renderer.pageIn(root, "shop");
  assertEquals(page, join(root, "docs", "shop", "architecture.md"));

  const rendering = await new Renderer(page).render("shop", shopArchitecture());

  assertEquals(rendering.written.map((path) => path.split("/").pop()), [
    "architecture.md",
    "architecture.svg",
    "architecture-light.svg",
    "architecture.reladraw",
  ]);
  assertEquals(rendering.stdout, undefined);
});
