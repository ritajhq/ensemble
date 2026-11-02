import { relative } from "@std/path";
import { exists } from "@std/fs";
import { denoConfigArgs } from "@ensemble/kit-sdk";

/** What's in a file that isn't code, consumed in one pass so a `//` in a string and a quote in a comment each stay what they are. */
const NON_CODE =
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\[\s\S])*`/g;

/** A file can choose its own JSX compilation, whatever the project's config says. */
const JSX_PRAGMA = /@jsx(?:Runtime|ImportSource|Frag)?\s/;

/** A closing tag, self-closing tag or fragment. Opening tags alone can't be told from type arguments. */
const JSX_TAG = /<\/[A-Za-z]|\/>|<>/;

/** An import or a declaration binding `React` at runtime. `import type` erases to nothing. */
const REACT_BINDING =
  /\bimport\s+(?!type\s)[^"'`;]*?\bReact\b[^"'`;]*?\bfrom\b|\b(?:const|let|var|function|class)\s+React\b/;

/**
 * Whether a React app's entry compiles to `React.createElement` calls with no
 * `React` to call. Reads the entry alone, since that's what can be told without
 * a parser or a module graph, and it stays silent whenever it can't be sure: a
 * project with no generated config, a custom `jsxFactory`, or a file with its
 * own pragma is doing something this check knows nothing about.
 */
export class JsxRuntimeCheck {
  constructor(private readonly repoRoot: string) {}

  /** What's wrong with `entry`, phrased for whoever has to fix it, if anything is. */
  async problemIn(entry: string): Promise<string | undefined> {
    const [, generatedConfig] = await denoConfigArgs(this.repoRoot);
    if (generatedConfig === undefined) return undefined;
    if (!await exists(entry, { isFile: true })) return undefined;

    const { compilerOptions: options = {} } = JSON.parse(
      await Deno.readTextFile(generatedConfig),
    );
    if (options.jsxFactory !== undefined) return undefined;
    if (options.jsx !== undefined && options.jsx !== "react") return undefined;

    const source = await Deno.readTextFile(entry);
    if (JSX_PRAGMA.test(source)) return undefined;
    const code = source.replace(
      NON_CODE,
      (text) => text[0] === "/" ? " " : '""',
    );
    if (!JSX_TAG.test(code) || REACT_BINDING.test(code)) return undefined;

    const settings = relative(
      this.repoRoot,
      generatedConfig.replace(/deno\.json$/, "settings.json"),
    );
    return `${relative(this.repoRoot, entry)} has JSX, and this project's ` +
      `compilerOptions leave it as classic JSX with no React in scope, so the ` +
      `page would throw "React is not defined" on load. In ${settings}, set ` +
      `"compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "react" }. ` +
      `To keep classic JSX instead, import React in that file.`;
  }
}
