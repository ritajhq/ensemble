import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { shopArchitecture } from "../shop-architecture.ts";
import { Files } from "./files.ts";
import { Page } from "./page.ts";
import { Renderer } from "./renderer.ts";

const page = () => new Page().write("shop", "architecture", shopArchitecture());

Deno.test("page: shows the drawing for a dark and a light page, with no instructions on reading it", () => {
  assertStringIncludes(page(), 'srcset="architecture.svg"');
  assertStringIncludes(page(), 'src="architecture-light.svg"');
  assertEquals(page().includes("Drawn from"), false);
});

Deno.test("page: leaves out what the drawing already shows, the computes and the storage", () => {
  assertEquals(page().includes("## compute"), false);
  assertEquals(page().includes("## storage"), false);
});

Deno.test("page: variables and secrets are one table, each typed as which it is, with what uses it", () => {
  const text = page();
  assertStringIncludes(text, "## Variables and secrets");
  assertStringIncludes(text, "| `region` | variable: string |");
  assertStringIncludes(text, "| `db-password` | secret: environment |");
  assertStringIncludes(text, "`compute.api`");
  assertEquals(text.includes("## variables"), false);
  assertEquals(text.includes("## secrets"), false);
});

Deno.test("page: externals are told in a sentence, not a table", () => {
  const text = page();
  assertStringIncludes(text, "## External");
  assertStringIncludes(
    text,
    "The deployment relies on what it doesn't create: `edge` (network, name: edge).",
  );
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
