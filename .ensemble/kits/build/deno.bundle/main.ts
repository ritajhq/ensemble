import { join } from "@std/path";
import { $ } from "@david/dax";
import * as KitSdk from "@ensemble/kit-sdk";
import {
  findRepoRoot,
  resolveDenoExecutable,
  type Spawned,
  terminateChildrenOnSignal,
  WatchedBundle,
  WorkspaceConfig,
} from "@ensemble/kit-sdk";

/** This kit's `build.<name>.options` from config.yaml — e.g. `format: cjs` and `external: [vscode]` for a VS Code extension, whose host supplies `vscode` at runtime. */
class Options {
  private readonly format?: string;
  private readonly external: string[];

  constructor(raw: Record<string, unknown>) {
    if (raw.format !== undefined && typeof raw.format !== "string") {
      throw new Error(`deno.bundle: option "format" must be a string.`);
    }
    if (raw.external !== undefined && !isStringArray(raw.external)) {
      throw new Error(
        `deno.bundle: option "external" must be a list of strings.`,
      );
    }
    this.format = raw.format;
    this.external = raw.external ?? [];
  }

  toArgs(): string[] {
    const formatArgs = this.format ? ["--format", this.format] : [];
    return [
      ...formatArgs,
      ...this.external.flatMap((specifier) => ["--external", specifier]),
    ];
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

const ctx = KitSdk.Build.getContext();

const entry = join(ctx.source, "main.ts");
const outFile = join(ctx.out, "main.js");

const modeArgs = ctx.mode === "production" ? ["--minify"] : [];
const optionArgs = new Options(ctx.options).toArgs();
const denoExe = await resolveDenoExecutable();
const configArgs = await KitSdk.denoConfigArgs(
  await findRepoRoot(ctx.workspace),
);

const buildOnce = (): Spawned =>
  $`${denoExe} bundle -q ${configArgs} ${entry} -o ${outFile} ${modeArgs} ${optionArgs}`
    .noThrow()
    .spawn();

// Watching, the kit rebuilds on its own (WatchedBundle) rather than through
// deno bundle --watch, whose long-lived process can wedge without a word.
const bundle = ctx.watch
  ? new WatchedBundle(entry, buildOnce, denoExe, configArgs).watch()
  : buildOnce();
terminateChildrenOnSignal([bundle]);

// A new workspace member or import-map entry changes what resolves, though no
// file of the graph changed: build again for it.
if (bundle instanceof WatchedBundle) {
  const config = new WorkspaceConfig(await findRepoRoot(ctx.workspace));
  config.OnChange.Do(() => bundle.rebuild());
  config.watch();
}

const result = await bundle;

Deno.exit(result.code);
