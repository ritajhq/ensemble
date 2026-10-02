import {
  basename,
  dirname,
  fromFileUrl,
  isAbsolute,
  join,
  resolve,
} from "@std/path";
import { ensureDir, exists, expandGlob } from "@std/fs";
import { $ } from "@david/dax";
import { Delegate, type Emitter } from "@duesabati/evento";
import * as KitSdk from "@ensemble/kit-sdk";
import {
  findRepoRoot,
  resolveDenoExecutable,
  RestartableChild,
  terminateChildrenOnSignal,
  WorkspaceConfig,
} from "@ensemble/kit-sdk";

const TAILWIND_RELEASE_BASE =
  "https://github.com/tailwindlabs/tailwindcss/releases/latest/download";

/**
 * `Deno.build` can't tell musl from glibc — Deno's own binary is statically
 * linked, so it reports `env: "gnu"` even on Alpine. The actual libc in use
 * only matters for other downloaded binaries (like Tailwind's standalone
 * CLI below), so check for musl's own dynamic linker directly rather than
 * trusting Deno.build.
 */
async function isMuslLibc(): Promise<boolean> {
  if (Deno.build.os !== "linux") return false;
  for await (const _entry of expandGlob("/lib/ld-musl-*.so.1")) {
    return true;
  }
  return false;
}

async function tailwindAssetName(): Promise<string> {
  const platform = `${Deno.build.os}-${Deno.build.arch}`;
  const musl = await isMuslLibc();
  switch (platform) {
    case "linux-x86_64":
      return musl ? "tailwindcss-linux-x64-musl" : "tailwindcss-linux-x64";
    case "linux-aarch64":
      return musl ? "tailwindcss-linux-arm64-musl" : "tailwindcss-linux-arm64";
    case "darwin-x86_64":
      return "tailwindcss-macos-x64";
    case "darwin-aarch64":
      return "tailwindcss-macos-arm64";
    case "windows-x86_64":
      return "tailwindcss-windows-x64.exe";
    default:
      throw new Error(
        `Unsupported platform for the Tailwind CLI binary: ${platform}`,
      );
  }
}

/**
 * Downloads the standalone Tailwind CLI binary into the kit's own directory
 * (once) instead of depending on npm/node module resolution.
 */
async function ensureTailwindBinary(kitDir: string): Promise<string> {
  const binDir = join(kitDir, ".bin");
  const binPath = join(
    binDir,
    Deno.build.os === "windows" ? "tailwindcss.exe" : "tailwindcss",
  );
  if (await exists(binPath, { isFile: true })) {
    return binPath;
  }

  await ensureDir(binDir);
  const url = `${TAILWIND_RELEASE_BASE}/${await tailwindAssetName()}`;
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(
      `Failed to download Tailwind CLI from ${url}: ${response.status}`,
    );
  }
  const file = await Deno.open(binPath, {
    create: true,
    write: true,
    truncate: true,
    mode: 0o755,
  });
  await response.body.pipeTo(file.writable);
  if (Deno.build.os !== "windows") {
    await Deno.chmod(binPath, 0o755);
  }
  return binPath;
}

/** Builds the `<script>` tag that seeds `globalThis.env` from the resolved build vars. */
function buildEnvScript(vars: Record<string, string>): string {
  const json = JSON.stringify(vars).replaceAll("<", "\\u003C");
  return `<script>globalThis.env = ${json};</script>`;
}

/**
 * Renders `public/index.html`, replacing the `{{ensemble:base}}` placeholder
 * (used for asset URLs) and the `{{ensemble:env}}` placeholder (replaced with
 * the globalThis.env script tag) via plain text substitution.
 */
async function writeIndexHtml(ctx: KitSdk.Build.Context): Promise<void> {
  const templatePath = join(ctx.source, "public", "index.html");
  const base = ctx.vars.BASE ?? "/";

  let html = await Deno.readTextFile(templatePath);
  html = html.replaceAll("{{ensemble:base}}", base);
  html = html.replaceAll("{{ensemble:env}}", buildEnvScript(ctx.vars));

  await Deno.writeTextFile(join(ctx.out, "index.html"), html);
}

/**
 * Re-renders index.html on every change to public/index.html, the same way
 * deno bundle --watch and tailwind --watch cover main.tsx and index.css —
 * without this, editing public/index.html while `ens build web --watch` is
 * running would silently keep serving whatever was rendered at startup.
 */
async function watchIndexHtml(ctx: KitSdk.Build.Context): Promise<void> {
  const templatePath = join(ctx.source, "public", "index.html");
  const watcher = Deno.watchFs(templatePath);
  for await (const event of watcher) {
    if (event.kind === "modify" || event.kind === "create") {
      await writeIndexHtml(ctx);
    }
  }
}

// How long to wait, after detecting an index.css source edit, before
// force-touching cssOut — long enough for Tailwind's own --watch=always
// rebuild (typically <200ms) to have finished writing (or skipping) its
// output first.
const CSS_TOUCH_DELAY_MS = 500;

/**
 * Tailwind's own CLI skips writing cssOut when the computed utility CSS
 * comes out byte-identical to what's already on disk (e.g. editing a
 * comment, or a source change that doesn't affect any generated utility) —
 * no write means no mtime change, which means no filesystem event for
 * anything watching cssOut downstream (notably Docker Compose Watch's
 * `sync`, which only syncs on a detected change event — see
 * workflows/deploy/compose.yaml's develop.watch block). Force-touching
 * cssOut guarantees a real event fires every time, regardless of whether
 * Tailwind itself decided the content was unchanged. Harmless when Tailwind
 * did write: the touch just follows it.
 */
async function touchCssOut(cssOut: string): Promise<void> {
  if (!await exists(cssOut, { isFile: true })) return;
  const now = new Date();
  await Deno.utime(cssOut, now, now);
}

// The Tailwind directives that name a file or directory by path.
const PATH_DIRECTIVE =
  /@(import|reference|source|plugin|config)(\s+(?:url\()?\s*)(["'])([^"']+)\3/g;
const STYLESHEET_DIRECTIVES = new Set(["import", "reference"]);

/**
 * The entry stylesheet and everything it reaches through `@import`, copied
 * into a staging directory with every relative path made absolute and every
 * workspace specifier (`@import "@scope/package/styles"`) resolved through
 * the member's `exports` — Tailwind's own resolver only knows node_modules,
 * so it can't reach a Deno workspace member on its own. Tailwind builds from
 * `entry`'s staged copy instead of the original.
 *
 * Restaging also covers Tailwind's --watch only noticing edits to the entry
 * file itself: an edit anywhere in the graph rewrites the staged entry, which
 * is what Tailwind is watching.
 */
class StagedStylesheet {
  private readonly staged = new Delegate<[]>();
  private sources: string[] = [];

  constructor(
    private readonly entry: string,
    private readonly repoRoot: string,
    private readonly stageDir: string,
  ) {}

  /** Fires after every restage that follows a source edit. */
  get OnStaged(): Emitter<[]> {
    return this.staged;
  }

  get stagedEntry(): string {
    return join(this.stageDir, "index.css");
  }

  /** Rewrites the staged copy of the whole graph, the entry last. */
  async stage(): Promise<void> {
    const members = await KitSdk.WorkspaceMembers.load(this.repoRoot);
    const stagedPaths = new Map([[this.entry, this.stagedEntry]]);
    const contents = new Map<string, string>();
    const queue = [this.entry];
    while (queue.length > 0) {
      const file = queue.shift()!;
      const css = await Deno.readTextFile(file);
      const rewrites = await this.rewritesFor(file, css, members);
      for (const target of rewrites.stylesheets) {
        if (stagedPaths.has(target)) continue;
        stagedPaths.set(
          target,
          join(this.stageDir, `${stagedPaths.size}-${basename(target)}`),
        );
        queue.push(target);
      }
      contents.set(
        file,
        css.replace(
          PATH_DIRECTIVE,
          (match, directive, gap, quote, specifier) => {
            const target = rewrites.targets.get(specifier);
            if (!target) return match;
            const path = STYLESHEET_DIRECTIVES.has(directive)
              ? stagedPaths.get(target) ?? target
              : target;
            return `@${directive}${gap}${quote}${path}${quote}`;
          },
        ),
      );
    }
    await ensureDir(this.stageDir);
    for (const [file, css] of contents) {
      if (file === this.entry) continue;
      await Deno.writeTextFile(stagedPaths.get(file)!, css);
    }
    await Deno.writeTextFile(this.stagedEntry, contents.get(this.entry)!);
    this.sources = [...contents.keys()];
  }

  /** Watches until the process exits, restaging on every edit to any stylesheet in the graph. */
  async watch(): Promise<void> {
    while (true) {
      const watcher = Deno.watchFs(this.sources);
      for await (const event of watcher) {
        if (event.kind === "modify" || event.kind === "create") break;
      }
      watcher.close();
      await this.restage();
    }
  }

  private async restage(): Promise<void> {
    try {
      await this.stage();
      this.staged.Invoke();
    } catch (error) {
      // Mid-save or a broken specifier: report it, keep the last good stage.
      console.error(
        `react: could not stage ${this.entry}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /** Each path directive's specifier in `css` → the absolute path it names, plus which of those are stylesheets to stage. */
  private async rewritesFor(
    file: string,
    css: string,
    members: KitSdk.WorkspaceMembers,
  ): Promise<{ targets: Map<string, string>; stylesheets: string[] }> {
    const targets = new Map<string, string>();
    const stylesheets: string[] = [];
    for (const [, directive, , , specifier] of css.matchAll(PATH_DIRECTIVE)) {
      const target = await this.resolveSpecifier(file, specifier, members);
      if (!target) continue;
      targets.set(specifier, target);
      if (STYLESHEET_DIRECTIVES.has(directive) && target.endsWith(".css")) {
        stylesheets.push(target);
      }
    }
    return { targets, stylesheets };
  }

  private resolveSpecifier(
    file: string,
    specifier: string,
    members: KitSdk.WorkspaceMembers,
  ): Promise<string | undefined> {
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      return Promise.resolve(resolve(dirname(file), specifier));
    }
    if (isAbsolute(specifier) || specifier.includes(":")) {
      return Promise.resolve(undefined);
    }
    return members.resolve(specifier);
  }
}

const ctx = KitSdk.Build.getContext();
const kitDir = dirname(fromFileUrl(import.meta.url));

// target "ssr" produces a hydration bundle (main.js + index.css) for a page
// a server renders itself — there is no standalone page for this kit to own.
if (ctx.target !== "ssr") {
  await writeIndexHtml(ctx);
  if (ctx.watch) watchIndexHtml(ctx);
}

const [denoExe, tailwindBin] = await Promise.all([
  resolveDenoExecutable(),
  ensureTailwindBinary(kitDir),
]);

const entry = join(ctx.source, "main.tsx");
const cssEntry = join(ctx.source, "index.css");
const jsOut = join(ctx.out, "main.js");
const cssOut = join(ctx.out, "index.css");

const repoRoot = await findRepoRoot(ctx.workspace);
const stylesheet = new StagedStylesheet(
  cssEntry,
  repoRoot,
  join(kitDir, ".stage", ctx.name),
);
await stylesheet.stage();

if (ctx.watch) {
  // Every restage follows a source edit; touch cssOut after each one so a
  // byte-identical Tailwind output still produces an event downstream.
  stylesheet.OnStaged.Do(async () => {
    await new Promise((resolve) => setTimeout(resolve, CSS_TOUCH_DELAY_MS));
    await touchCssOut(cssOut);
  });
  stylesheet.watch();
  // Covers the startup case the restage hook can't: give Tailwind's initial
  // build below a moment to run, then touch regardless of whether it
  // actually wrote anything.
  (async () => {
    await new Promise((resolve) => setTimeout(resolve, CSS_TOUCH_DELAY_MS));
    await touchCssOut(cssOut);
  })();
}

const minifyArgs = ctx.mode === "production" ? ["--minify"] : [];
const watchArgs = ctx.watch ? ["--watch"] : [];
// Tailwind's own `--watch` stops as soon as stdin closes, which is always
// the case for a spawned subprocess — `=always` keeps it watching regardless.
const cssWatchArgs = ctx.watch ? ["--watch=always"] : [];

const bundle = new RestartableChild(() =>
  $`${denoExe} bundle -q --platform browser ${entry} -o ${jsOut} ${minifyArgs} ${watchArgs}`
    .noThrow()
    .spawn()
);
// --silent: Tailwind's own version banner and "Done in Xms" line are noise
// on every successful (re)build — it still writes real errors to stderr
// even with this on, so a broken build is never silenced.
const css = new RestartableChild(() =>
  $`${tailwindBin} --silent --cwd ${ctx.source} -i ${stylesheet.stagedEntry} -o ${cssOut} ${minifyArgs} ${cssWatchArgs}`
    .noThrow()
    .spawn()
);
// Neither of these is reliably reachable by a plain kill/Ctrl+C of just this
// kit's own process — see terminateChildrenOnSignal's own doc comment — so
// without this, --watch/--watch=always above (deliberately immune to their
// own usual stop conditions) leave both running as orphans indefinitely.
terminateChildrenOnSignal([bundle, css]);

if (ctx.watch) {
  // deno bundle --watch reads the workspace members and import maps only at
  // startup — restart it so a new member or import-map entry becomes resolvable.
  const config = new WorkspaceConfig(repoRoot);
  config.OnChange.Do(() => bundle.restart());
  config.watch();
}

const [bundleResult, cssResult] = await Promise.all([bundle, css]);

Deno.exit(bundleResult.code !== 0 ? bundleResult.code : cssResult.code);
