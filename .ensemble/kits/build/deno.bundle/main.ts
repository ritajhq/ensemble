import { join } from "@std/path";
import { $ } from "@david/dax";
import * as KitSdk from "@ensemble/kit-sdk";
import {
  findRepoRoot,
  resolveDenoExecutable,
  RestartableChild,
  terminateChildrenOnSignal,
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
const watchArgs = ctx.watch ? ["--watch"] : [];
const optionArgs = new Options(ctx.options).toArgs();
const denoExe = await resolveDenoExecutable();

const bundle = new RestartableChild(() =>
  $`${denoExe} bundle -q ${entry} -o ${outFile} ${modeArgs} ${watchArgs} ${optionArgs}`
    .noThrow()
    .spawn()
);
terminateChildrenOnSignal([bundle]);

// deno bundle --watch reads the workspace members and import maps only at
// startup — restart it so a new member or import-map entry becomes resolvable.
if (ctx.watch) {
  const config = new WorkspaceConfig(await findRepoRoot(ctx.workspace));
  config.OnChange.Do(() => bundle.restart());
  config.watch();
}

const result = await bundle;

Deno.exit(result.code);
