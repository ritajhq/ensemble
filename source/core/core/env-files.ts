import { join, resolve } from "@std/path";
import { exists } from "@std/fs";
import { parse as parseEnvFile } from "@std/dotenv";
import type * as Deploy from "./deploy/index.ts";

/**
 * One env file a deployment's values may come from — a repo-root-relative
 * (or absolute) path. A `required` one that doesn't exist fails; an optional
 * one (only `ens develop`'s conventional pair) is silently skipped.
 */
export interface EnvFile {
  readonly path: string;
  readonly required: boolean;
}

/**
 * `variables`/`secrets` with `source: environment` are read straight off
 * `Deno.env` at render time (`DeclaredValues`, `composeSecretWiring`) under an
 * uppercase, dash-to-underscore name — so an env file's key goes through the
 * same transform, or a lowercase `frontend_base_url` would sit next to the
 * `FRONTEND_BASE_URL` the render looks up and never be seen.
 */
function environmentVariableName(name: string): string {
  return name.toUpperCase().replace(/-/g, "_");
}

/**
 * A `$NAME`/`${NAME}` in a value @std/dotenv would expand (anything but a
 * single-quoted value) — expansion that silently yields "undefined" for an
 * unknown name, and that env files deliberately don't offer.
 */
const EXPANDABLE_REFERENCE =
  /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?!')(.*(?<!\\)\$(?:\{|[A-Za-z_]).*)$/m;

/**
 * Where a deployment's values come from, ahead of any render: the process
 * environment first — the whole contract for a real pipeline, which exports
 * every value itself — then, only when asked, flat `KEY=value` env files as
 * defaults beneath it. The manifest's own `variables`/`secrets` are the one
 * declaration of what's needed; the files only supply values.
 */
export class DeploymentEnvironment {
  constructor(private readonly repoRoot: string) {}

  /** `--env-file` paths as the user named them: each one must exist. */
  static required(paths: readonly string[] = []): EnvFile[] {
    return paths.map((path) => ({ path, required: true }));
  }

  /**
   * `ens develop`'s files when it's given no `--env-file`: the committed
   * `ci/<name>/dev.env` and the untracked
   * `.ensemble/deploy/<name>/secrets.env` (`.ensemble/.gitignore` ignores
   * `deploy/`) for dev values that mustn't be committed — both optional.
   */
  static developConvention(name: string): EnvFile[] {
    return [
      { path: join("ci", name, "dev.env"), required: false },
      {
        path: join(".ensemble", "deploy", name, "secrets.env"),
        required: false,
      },
    ];
  }

  /**
   * Sets each file's keys into `Deno.env`, never over a value already
   * exported there. The same key in two files is rejected instead of one
   * silently shadowing the other, as is a `$` reference: files don't
   * interpolate.
   */
  async load(files: readonly EnvFile[]): Promise<void> {
    const sources = new Map<string, string>();
    const values: Record<string, string> = {};
    for (const file of files) {
      const path = resolve(this.repoRoot, file.path);
      const text = await this.read(path, file.required);
      if (text === undefined) continue;
      this.assertNoReferences(text, path);
      for (const [key, value] of Object.entries(parseEnvFile(text))) {
        const previous = sources.get(key);
        if (previous !== undefined) {
          throw new Error(`${key} is defined in both ${previous} and ${path}.`);
        }
        sources.set(key, path);
        values[key] = value;
      }
    }

    for (const [key, value] of Object.entries(values)) {
      const variable = environmentVariableName(key);
      if (Deno.env.get(variable) !== undefined) continue;
      Deno.env.set(variable, value);
    }
  }

  /**
   * Fails before any render, naming every value the manifest needs and the
   * environment doesn't have — a variable without a `default:`, or an
   * environment-sourced secret — instead of one at a time mid-render, or a
   * target that would deploy it empty.
   */
  assertComplete(workload: Deploy.Workload): void {
    const needed = [
      ...Object.entries(workload.variables ?? {})
        .filter(([, declaration]) => declaration.default === undefined)
        .map(([name]) => ({ entry: `variables.${name}`, name })),
      ...Object.entries(workload.secrets ?? {})
        .filter(([, declaration]) => declaration.source === "environment")
        .map(([name]) => ({ entry: `secrets.${name}`, name })),
    ].map(({ entry, name }) => ({
      entry,
      variable: environmentVariableName(name),
    }));

    const missing = needed.filter(({ variable }) =>
      Deno.env.get(variable) === undefined
    );
    if (missing.length === 0) return;
    throw new Error(
      `No value for ${missing.map(({ entry }) => entry).join(", ")}: export ${
        missing.map(({ variable }) => variable).join(", ")
      }, or pass an --env-file that sets them.`,
    );
  }

  private async read(
    path: string,
    required: boolean,
  ): Promise<string | undefined> {
    if (await exists(path, { isFile: true })) {
      return await Deno.readTextFile(path);
    }
    if (!required) return undefined;
    throw new Error(`Env file not found: ${path}`);
  }

  private assertNoReferences(text: string, path: string): void {
    const match = text.match(EXPANDABLE_REFERENCE);
    if (!match) return;
    throw new Error(
      `${
        match[1]
      } in ${path} contains a $ reference — env files don't interpolate; single-quote the value if the $ is literal.`,
    );
  }
}
