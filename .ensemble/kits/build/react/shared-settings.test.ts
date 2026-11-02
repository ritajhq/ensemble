import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { SharedSettings } from "./shared-settings.ts";

const REACT_OPTIONS = {
  jsx: "react-jsx",
  jsxImportSource: "react",
  lib: ["dom", "dom.iterable", "deno.ns"],
};

/** A project as `ens init` leaves it: a generated config, with `settings` beside it unless left out. */
async function project(settings?: string): Promise<string> {
  const root = await Deno.makeTempDir();
  const directory = join(root, ".ensemble", "ecosystems", "deno");
  await Deno.mkdir(directory, { recursive: true });
  await Deno.writeTextFile(join(directory, "deno.json"), "{}\n");
  if (settings !== undefined) {
    await Deno.writeTextFile(join(directory, "settings.json"), settings);
  }
  return root;
}

function settingsPath(root: string): string {
  return join(root, ".ensemble", "ecosystems", "deno", "settings.json");
}

async function readSettings(root: string): Promise<unknown> {
  return JSON.parse(await Deno.readTextFile(settingsPath(root)));
}

Deno.test("seedCompilerOptions: fills in a fresh project's empty settings", async () => {
  const root = await project("{}\n");
  const seeded = await new SharedSettings(root)
    .seedCompilerOptions(REACT_OPTIONS);
  assertEquals(seeded, ["jsx", "jsxImportSource", "lib"]);
  assertEquals(await readSettings(root), { compilerOptions: REACT_OPTIONS });
});

Deno.test("seedCompilerOptions: creates the settings of a project with none", async () => {
  const root = await project();
  await new SharedSettings(root).seedCompilerOptions(REACT_OPTIONS);
  assertEquals(await readSettings(root), { compilerOptions: REACT_OPTIONS });
});

Deno.test("seedCompilerOptions: keeps what the project set, adding only what it didn't", async () => {
  const root = await project(JSON.stringify({
    compilerOptions: { jsxImportSource: "preact", strict: false },
    unstable: ["kv"],
  }));
  const seeded = await new SharedSettings(root)
    .seedCompilerOptions(REACT_OPTIONS);
  assertEquals(seeded, ["jsx", "lib"]);
  assertEquals(await readSettings(root), {
    compilerOptions: {
      ...REACT_OPTIONS,
      jsxImportSource: "preact",
      strict: false,
    },
    unstable: ["kv"],
  });
});

Deno.test("seedCompilerOptions: leaves the file untouched when nothing is missing", async () => {
  const written = `{"compilerOptions":${JSON.stringify(REACT_OPTIONS)}}`;
  const root = await project(written);
  const seeded = await new SharedSettings(root)
    .seedCompilerOptions(REACT_OPTIONS);
  assertEquals(seeded, []);
  assertEquals(await Deno.readTextFile(settingsPath(root)), written);
});

Deno.test("seedCompilerOptions: a project with a root deno.json has nothing to share", async () => {
  const root = await project();
  await Deno.writeTextFile(join(root, "deno.json"), "{}\n");
  const seeded = await new SharedSettings(root)
    .seedCompilerOptions(REACT_OPTIONS);
  assertEquals(seeded, []);
  assertEquals(
    await Deno.stat(settingsPath(root)).then(() => true, () => false),
    false,
  );
});
