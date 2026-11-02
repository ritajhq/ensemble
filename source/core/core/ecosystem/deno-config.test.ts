import { assertEquals } from "@std/assert";
import { DenoConfig, type DenoManifest } from "./deno-config.ts";

const DIRECTORY = "/repo/.ensemble/ecosystems/deno";

function render(
  manifests: DenoManifest[],
  settings: Record<string, unknown> = {},
) {
  return JSON.parse(new DenoConfig(DIRECTORY, manifests, settings).render());
}

const CORE: DenoManifest = {
  path: "/repo/source/core/core/deno.json",
  contents: {
    name: "@x/core",
    exports: { ".": "./index.ts", "./entry": "./entry.ts" },
  },
};

Deno.test("DenoConfig: another package's name resolves to its files, whatever version it pins", () => {
  const config = render([CORE, {
    path: "/repo/source/apps/api/deno.json",
    contents: {
      imports: {
        "@x/core": "jsr:@x/core@^0.1.0",
        "core-alias": "jsr:@x/core",
        "@std/path": "jsr:@std/path@1.1.6",
        "react": "npm:react@19",
        "local": "./lib/local.ts",
      },
    },
  }]);

  assertEquals(config.scopes["../../../source/apps/api/"], {
    "@std/path": "jsr:@std/path@1.1.6",
    "@x/core": "../../../source/core/core/index.ts",
    "@x/core/": "../../../source/core/core/",
    "@x/core/entry": "../../../source/core/core/entry.ts",
    "core-alias": "../../../source/core/core/index.ts",
    "core-alias/": "../../../source/core/core/",
    "core-alias/entry": "../../../source/core/core/entry.ts",
    "local": "../../../source/apps/api/lib/local.ts",
    "react": "npm:react@19",
  });
});

Deno.test("DenoConfig: an import naming one export resolves to that file", () => {
  const config = render([CORE, {
    path: "/repo/source/apps/api/deno.json",
    contents: { imports: { "entry": "jsr:@x/core@^0.1.0/entry" } },
  }]);

  assertEquals(config.scopes["../../../source/apps/api/"], {
    "entry": "../../../source/core/core/entry.ts",
  });
});

Deno.test("DenoConfig: a kit is scoped like any package, and settings carry through", () => {
  const config = render([{
    path: "/repo/.ensemble/kits/build/cargo/deno.json",
    contents: { imports: { "@std/fs": "jsr:@std/fs@1.0.24" } },
  }], { compilerOptions: { jsx: "react-jsx" }, imports: { "a": "npm:a@1" } });

  assertEquals(config.scopes["../../kits/build/cargo/"], {
    "@std/fs": "jsr:@std/fs@1.0.24",
  });
  assertEquals(config.compilerOptions, { jsx: "react-jsx" });
  assertEquals(config.imports, { "a": "npm:a@1" });
  assertEquals(config.lock, "./deno.lock");
});

Deno.test("DenoConfig: a package's exclusions are kept, relative to the config", () => {
  const config = render([{
    path: "/repo/.ensemble/kits/deploy/aws/deno.json",
    contents: { exclude: ["runtime/"] },
  }]);

  assertEquals(config.exclude, ["../../kits/deploy/aws/runtime"]);
});

Deno.test("DenoConfig: the same packages always render the same text", () => {
  const manifests = [CORE];
  assertEquals(
    new DenoConfig(DIRECTORY, manifests, {}).render(),
    new DenoConfig(DIRECTORY, manifests, {}).render(),
  );
});
