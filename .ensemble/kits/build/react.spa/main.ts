import { dirname, fromFileUrl, join } from "@std/path";
import { ensureDir, exists, expandGlob } from "@std/fs";
import { $ } from "@david/dax";
import { getKitContext, type KitContext } from "@ensemble/kit-sdk";
import { resolveDenoExecutable } from "@ensemble/core";

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
      throw new Error(`Unsupported platform for the Tailwind CLI binary: ${platform}`);
  }
}

/**
 * Downloads the standalone Tailwind CLI binary into the kit's own directory
 * (once) instead of depending on npm/node module resolution.
 */
async function ensureTailwindBinary(kitDir: string): Promise<string> {
  const binDir = join(kitDir, ".bin");
  const binPath = join(binDir, Deno.build.os === "windows" ? "tailwindcss.exe" : "tailwindcss");
  if (await exists(binPath, { isFile: true })) {
    return binPath;
  }

  await ensureDir(binDir);
  const url = `${TAILWIND_RELEASE_BASE}/${await tailwindAssetName()}`;
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download Tailwind CLI from ${url}: ${response.status}`);
  }
  const file = await Deno.open(binPath, { create: true, write: true, truncate: true, mode: 0o755 });
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
async function writeIndexHtml(ctx: KitContext): Promise<void> {
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
async function watchIndexHtml(ctx: KitContext): Promise<void> {
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

/**
 * Watches cssEntry for edits, touching cssOut shortly after each one — the
 * ongoing half of the fix; touchCssOut's own first call (below, right after
 * Tailwind's initial run) covers the startup case this watcher can't: `ens
 * build web --watch` starting up against a cssOut that a PRIOR build (e.g.
 * deploy's own initial sync) already wrote with matching content — no source
 * edit ever happens in that case, so a watcher alone would never fire.
 */
async function touchCssOutOnChange(cssEntry: string, cssOut: string): Promise<void> {
  const watcher = Deno.watchFs(cssEntry);
  for await (const event of watcher) {
    if (event.kind !== "modify" && event.kind !== "create") continue;
    await new Promise((resolve) => setTimeout(resolve, CSS_TOUCH_DELAY_MS));
    await touchCssOut(cssOut);
  }
}

const ctx = getKitContext();
const kitDir = dirname(fromFileUrl(import.meta.url));

await writeIndexHtml(ctx);
if (ctx.watch) watchIndexHtml(ctx);

const [denoExe, tailwindBin] = await Promise.all([
  resolveDenoExecutable(),
  ensureTailwindBinary(kitDir),
]);

const entry = join(ctx.source, "main.tsx");
const cssEntry = join(ctx.source, "index.css");
const jsOut = join(ctx.out, "main.js");
const cssOut = join(ctx.out, "index.css");

if (ctx.watch) {
  touchCssOutOnChange(cssEntry, cssOut);
  // Covers the startup case touchCssOutOnChange's watcher can't (see its own
  // doc comment): give Tailwind's initial build below a moment to run, then
  // touch regardless of whether it actually wrote anything.
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

const [bundleResult, cssResult] = await Promise.all([
  $`${denoExe} bundle -q --platform browser ${entry} -o ${jsOut} ${minifyArgs} ${watchArgs}`
    .noThrow(),
  $`${tailwindBin} --cwd ${ctx.source} -i ${cssEntry} -o ${cssOut} ${minifyArgs} ${cssWatchArgs}`
    .noThrow(),
]);

if (bundleResult.code === 0 && cssResult.code === 0) console.log(`built ${ctx.name}`);

Deno.exit(bundleResult.code !== 0 ? bundleResult.code : cssResult.code);
