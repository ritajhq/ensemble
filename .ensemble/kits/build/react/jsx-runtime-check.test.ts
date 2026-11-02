import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";
import { JsxRuntimeCheck } from "./jsx-runtime-check.ts";

const AUTOMATIC = { jsx: "react-jsx", jsxImportSource: "react" };
const JSX_ENTRY = `export const App = () => <div>it's fine</div>;\n`;

/** A project whose generated config carries `compilerOptions`, with an app whose entry is `entry`. */
async function project(
  compilerOptions: Record<string, unknown> | undefined,
  entry: string,
): Promise<{ root: string; entry: string }> {
  const root = await Deno.makeTempDir({ prefix: "react-kit-test-" });
  const ecosystem = join(root, ".ensemble", "ecosystems", "deno");
  const app = join(root, "source", "apps", "web");
  await Deno.mkdir(ecosystem, { recursive: true });
  await Deno.mkdir(join(app, "public"), { recursive: true });
  await Deno.mkdir(join(root, "source", "artifacts", "web"), {
    recursive: true,
  });
  await Deno.writeTextFile(
    join(ecosystem, "deno.json"),
    JSON.stringify({
      ...(compilerOptions ? { compilerOptions } : {}),
      nodeModulesDir: "none",
      imports: {
        react: "npm:react@19.2.8",
        "react/": "npm:/react@19.2.8/",
        "react-dom": "npm:react-dom@19.2.8",
        "react-dom/client": "npm:react-dom@19.2.8/client",
      },
    }),
  );
  await Deno.writeTextFile(join(app, "main.tsx"), entry);
  await Deno.writeTextFile(join(app, "index.css"), "");
  await Deno.writeTextFile(
    join(app, "public", "index.html"),
    "<!doctype html>",
  );
  return { root, entry: join(app, "main.tsx") };
}

async function problemIn(
  compilerOptions: Record<string, unknown> | undefined,
  entry: string,
): Promise<string | undefined> {
  const made = await project(compilerOptions, entry);
  return await new JsxRuntimeCheck(made.root).problemIn(made.entry);
}

/** Runs the kit itself on a project, the way `ens build` does. */
async function build(root: string): Promise<Deno.CommandOutput> {
  const kit = dirname(fromFileUrl(import.meta.url));
  return await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "-A",
      "-q",
      "--config",
      join(kit, "..", "..", "..", "ecosystems", "deno", "deno.json"),
      join(kit, "main.ts"),
      "--source",
      join(root, "source", "apps", "web"),
      "--name",
      "web",
      "--out",
      join(root, "source", "artifacts", "web"),
      "--mode",
      "development",
      "--workspace",
      join(root, "source"),
      "--vars",
      "{}",
    ],
    cwd: kit,
    stdout: "piped",
    stderr: "piped",
  }).output();
}

Deno.test("problemIn: JSX, no runtime and no React is the blank page", async () => {
  const problem = await problemIn(undefined, JSX_ENTRY);
  assert(problem);
  assertStringIncludes(problem, join("source", "apps", "web", "main.tsx"));
  assertStringIncludes(
    problem,
    join(".ensemble", "ecosystems", "deno", "settings.json"),
  );
  assertStringIncludes(problem, `"jsx": "react-jsx"`);
});

Deno.test("problemIn: choosing classic JSX without importing React is too", async () => {
  assert(await problemIn({ jsx: "react" }, JSX_ENTRY));
});

Deno.test("problemIn: a JSX runtime in the config settles it", async () => {
  assertEquals(await problemIn(AUTOMATIC, JSX_ENTRY), undefined);
  assertEquals(await problemIn({ jsx: "precompile" }, JSX_ENTRY), undefined);
});

for (
  const statement of [
    `import React from "react";`,
    `import React, { useState } from "react";`,
    `import * as React from "react";`,
    `import { default as React } from "react";`,
    `import {\n  default as React,\n  useState,\n} from "react";`,
    `const React = globalThis.React;`,
  ]
) {
  Deno.test(`problemIn: classic JSX with ${statement} has React in scope`, async () => {
    const entry = `${statement}\n${JSX_ENTRY}`;
    assertEquals(await problemIn(undefined, entry), undefined);
    assertEquals(await problemIn({ jsx: "react" }, entry), undefined);
  });
}

Deno.test("problemIn: a type-only import leaves no React at runtime", async () => {
  assert(
    await problemIn(undefined, `import type React from "react";\n${JSX_ENTRY}`),
  );
});

Deno.test("problemIn: React only named in a comment or a string isn't in scope", async () => {
  assert(
    await problemIn(
      undefined,
      `// import React from "react";\nconst note = "const React = 1";\n${JSX_ENTRY}`,
    ),
  );
});

Deno.test("problemIn: a file's own pragma or a custom factory is its own business", async () => {
  assertEquals(
    await problemIn(undefined, `/** @jsxRuntime automatic */\n${JSX_ENTRY}`),
    undefined,
  );
  assertEquals(
    await problemIn(
      undefined,
      `/** @jsxImportSource npm:preact@10 */\n${JSX_ENTRY}`,
    ),
    undefined,
  );
  assertEquals(await problemIn({ jsxFactory: "h" }, JSX_ENTRY), undefined);
});

Deno.test("problemIn: an entry with no JSX has nothing to compile", async () => {
  assertEquals(
    await problemIn(
      undefined,
      `import { App } from "./app.tsx";\nconst html = "<div/>"; // </div>\nApp(html);\nconst n = new Map<string, number>();\n`,
    ),
    undefined,
  );
});

Deno.test("problemIn: a project with a root deno.json isn't judged", async () => {
  const made = await project(undefined, JSX_ENTRY);
  await Deno.writeTextFile(join(made.root, "deno.json"), "{}\n");
  assertEquals(
    await new JsxRuntimeCheck(made.root).problemIn(made.entry),
    undefined,
  );
});

Deno.test("build: fails, naming the fix, before bundling a blank page", async () => {
  const { root } = await project(undefined, JSX_ENTRY);
  const { code, stderr } = await build(root);
  assertEquals(code, 1);
  assertStringIncludes(new TextDecoder().decode(stderr), "settings.json");
});

Deno.test("build: a correctly configured project still builds", async () => {
  const { root } = await project(
    AUTOMATIC,
    `import { createRoot } from "react-dom/client";\ncreateRoot(document.body).render(<div />);\n`,
  );
  const { code, stderr } = await build(root);
  assertEquals(code, 0, new TextDecoder().decode(stderr));
  const bundle = await Deno.readTextFile(
    join(root, "source", "artifacts", "web", "main.js"),
  );
  assertEquals(bundle.includes("React.createElement"), false);
});

Deno.test("build: classic JSX that imports React still builds", async () => {
  const { root } = await project(
    { jsx: "react" },
    `import React from "react";\nimport { createRoot } from "react-dom/client";\ncreateRoot(document.body).render(<div />);\n`,
  );
  const { code, stderr } = await build(root);
  assertEquals(code, 0, new TextDecoder().decode(stderr));
});
