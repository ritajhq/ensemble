import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { getScaffoldKitContext } from "@ensemble/kit-sdk";

const DENO_JSON = `{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "lib": ["dom", "dom.iterable", "deno.ns"],
    "types": ["npm:@types/react@19", "npm:@types/react-dom@19"]
  },
  "imports": {
    "react": "npm:react@19.2.8",
    "react-dom": "npm:react-dom@19.2.8",
    "react-dom/client": "npm:react-dom@19.2.8/client",
    "@types/react": "npm:@types/react@19",
    "@types/react-dom": "npm:@types/react-dom@19"
  }
}
`;

const MAIN_TSX = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function App() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-950 text-slate-50">
      <h1 className="text-4xl font-bold">Hello, world!</h1>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;

const INDEX_CSS = `@import "tailwindcss";\n`;

const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>%NAME%</title>
    <link rel="stylesheet" href="{{ensemble:base}}index.css" />
    {{ensemble:env}}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="{{ensemble:base}}main.js"></script>
  </body>
</html>
`;

const ctx = getScaffoldKitContext();
await ensureDir(join(ctx.dest, "public"));

await Deno.writeTextFile(join(ctx.dest, "deno.json"), DENO_JSON);
await Deno.writeTextFile(join(ctx.dest, "main.tsx"), MAIN_TSX);
await Deno.writeTextFile(join(ctx.dest, "index.css"), INDEX_CSS);
await Deno.writeTextFile(
  join(ctx.dest, "public", "index.html"),
  INDEX_HTML.replace("%NAME%", ctx.name),
);

console.log(`scaffolded ${ctx.name}`);
