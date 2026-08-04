import { walk } from "jsr:@std/fs@1/walk";

const root = new URL("../", import.meta.url).pathname;
const denoJsonPath = `${root}deno.json`;

const exports: Record<string, string> = { ".": "./index.ts" };

for (const dir of ["lib", "hooks", "components"]) {
  for await (
    const entry of walk(`${root}${dir}`, {
      exts: [".ts", ".tsx"],
      includeDirs: false,
    })
  ) {
    const relative = entry.path.slice(root.length);
    const subpath = `./${relative.replace(/\.tsx?$/, "")}`;
    exports[subpath] = `./${relative}`;
  }
}

const sortedExports = Object.fromEntries(
  Object.entries(exports).sort(([a], [b]) => a.localeCompare(b)),
);

const config = JSON.parse(await Deno.readTextFile(denoJsonPath));
config.exports = sortedExports;

await Deno.writeTextFile(denoJsonPath, JSON.stringify(config, null, 2) + "\n");
