import { dirname, join } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import { strFromU8, unzipSync } from "fflate";
import { FunctionPackage } from "./function-package.ts";

async function withArtifacts(
  files: Record<string, string>,
  body: (artifactsDir: string) => Promise<void>,
): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "aws-function-package-" });
  try {
    for (const [path, content] of Object.entries(files)) {
      await Deno.mkdir(dirname(join(dir, path)), { recursive: true });
      await Deno.writeTextFile(join(dir, path), content);
    }
    await body(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("FunctionPackage: each rule's build output lands at its path inside the zip", async () => {
  await withArtifacts({
    "server/main.js": "server",
    "server/main.js.map": "map",
    "shared/util/a.js": "a",
  }, async (artifacts) => {
    const zip = await new FunctionPackage([
      { app: "server", path: "/" },
      { app: "shared", path: "./vendor/" },
    ], artifacts).zip();

    const files = Object.fromEntries(
      Object.entries(unzipSync(zip)).map((
        [name, bytes],
      ) => [name, strFromU8(bytes)]),
    );
    assertEquals(files, {
      "main.js": "server",
      "main.js.map": "map",
      "vendor/util/a.js": "a",
    });
  });
});

Deno.test("FunctionPackage: a rule's ignore patterns leave matching files out", async () => {
  await withArtifacts(
    { "server/main.js": "server", "server/main.js.map": "map" },
    async (artifacts) => {
      const zip = await new FunctionPackage([{
        app: "server",
        path: "/",
        ignore: ["*.map"],
      }], artifacts).zip();

      assertEquals(Object.keys(unzipSync(zip)), ["main.js"]);
    },
  );
});

Deno.test("FunctionPackage: the same files always zip to the same bytes", async () => {
  await withArtifacts({ "server/main.js": "server" }, async (artifacts) => {
    const bundle = new FunctionPackage(
      [{ app: "server", path: "/" }],
      artifacts,
    );

    assertEquals(await bundle.zip(), await bundle.zip());
  });
});

Deno.test("FunctionPackage: an app with no build output is an error naming it", async () => {
  await withArtifacts({}, async (artifacts) => {
    await assertRejects(
      () =>
        new FunctionPackage([{ app: "server", path: "/" }], artifacts).zip(),
      Error,
      `No build of "server"`,
    );
  });
});
