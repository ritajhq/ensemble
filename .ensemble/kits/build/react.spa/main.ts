import { dirname, fromFileUrl, join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { $ } from "@david/dax";
import { getKitContext, type KitContext } from "@ensemble/kit-sdk";
import { resolveDenoExecutable } from "@ensemble/core";

const TAILWIND_RELEASE_BASE =
  "https://github.com/tailwindlabs/tailwindcss/releases/latest/download";

function tailwindAssetName(): string {
  const platform = `${Deno.build.os}-${Deno.build.arch}`;
  switch (platform) {
    case "linux-x86_64":
      return "tailwindcss-linux-x64";
    case "linux-aarch64":
      return "tailwindcss-linux-arm64";
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
  const url = `${TAILWIND_RELEASE_BASE}/${tailwindAssetName()}`;
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

const ctx = getKitContext();
const kitDir = dirname(fromFileUrl(import.meta.url));

await writeIndexHtml(ctx);

const [denoExe, tailwindBin] = await Promise.all([
  resolveDenoExecutable(),
  ensureTailwindBinary(kitDir),
]);

const entry = join(ctx.source, "main.tsx");
const cssEntry = join(ctx.source, "index.css");
const jsOut = join(ctx.out, "main.js");
const cssOut = join(ctx.out, "index.css");

const minifyArgs = ctx.mode === "production" ? ["--minify"] : [];
const watchArgs = ctx.watch ? ["--watch"] : [];

const [bundleResult, cssResult] = await Promise.all([
  $`${denoExe} bundle --platform browser ${entry} -o ${jsOut} ${minifyArgs} ${watchArgs}`
    .noThrow(),
  $`${tailwindBin} --cwd ${ctx.source} -i ${cssEntry} -o ${cssOut} ${minifyArgs} ${watchArgs}`
    .noThrow(),
]);

Deno.exit(bundleResult.code !== 0 ? bundleResult.code : cssResult.code);
