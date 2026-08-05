import { dirname, isAbsolute, join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { parse as parseYaml } from "@std/yaml";
import { $ } from "@david/dax";
import { getPackKitContext } from "@ensemble/kit-sdk";
import { resolveDenoExecutable } from "@ensemble/core";

const ctx = getPackKitContext();

interface CompilePermissions {
  "allow-all"?: boolean;
  "allow-read"?: boolean | string[];
  "allow-write"?: boolean | string[];
  "allow-net"?: boolean | string[];
  "allow-env"?: boolean | string[];
  "allow-sys"?: boolean | string[];
  "allow-run"?: boolean | string[];
  "allow-ffi"?: boolean | string[];
  "allow-import"?: boolean | string[];
  "deny-read"?: string[];
  "deny-write"?: string[];
  "deny-net"?: string[];
  "deny-env"?: string[];
  "deny-sys"?: string[];
  "deny-run"?: string[];
  "deny-ffi"?: string[];
  "deny-import"?: string[];
}

interface CompileConfig {
  source: string;
  output?: string;
  target?: string;
  "app-name"?: string;
  icon?: string;
  bundle?: boolean;
  minify?: boolean;
  "no-terminal"?: boolean;
  "self-extracting"?: boolean;
  "exclude-unused-npm"?: boolean;
  include?: string[];
  exclude?: string[];
  permissions?: CompilePermissions;
}

const ALLOW_KEYS = [
  "allow-read",
  "allow-write",
  "allow-net",
  "allow-env",
  "allow-sys",
  "allow-run",
  "allow-ffi",
  "allow-import",
] as const;

const DENY_KEYS = [
  "deny-read",
  "deny-write",
  "deny-net",
  "deny-env",
  "deny-sys",
  "deny-run",
  "deny-ffi",
  "deny-import",
] as const;

const KNOWN_TOP_LEVEL_KEYS = new Set([
  "source",
  "output",
  "target",
  "app-name",
  "icon",
  "bundle",
  "minify",
  "no-terminal",
  "self-extracting",
  "exclude-unused-npm",
  "include",
  "exclude",
  "permissions",
]);

const KNOWN_PERMISSION_KEYS = new Set<string>(["allow-all", ...ALLOW_KEYS, ...DENY_KEYS]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function fail(message: string): never {
  throw new Error(`compile.yml: ${message}`);
}

function validatePermissions(raw: unknown): CompilePermissions | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) fail(`"permissions" must be a mapping.`);

  for (const key of Object.keys(raw)) {
    if (!KNOWN_PERMISSION_KEYS.has(key)) {
      fail(`unknown permission "${key}".`);
    }
  }

  if (raw["allow-all"] !== undefined && typeof raw["allow-all"] !== "boolean") {
    fail(`"permissions.allow-all" must be a boolean.`);
  }
  for (const key of ALLOW_KEYS) {
    const value = raw[key];
    if (value !== undefined && typeof value !== "boolean" && !isStringArray(value)) {
      fail(`"permissions.${key}" must be a boolean or a list of strings.`);
    }
  }
  for (const key of DENY_KEYS) {
    const value = raw[key];
    if (value !== undefined && !isStringArray(value)) {
      fail(`"permissions.${key}" must be a list of strings.`);
    }
  }

  return raw as CompilePermissions;
}

function validateConfig(raw: unknown): CompileConfig {
  if (!isRecord(raw)) fail("must be a mapping.");

  for (const key of Object.keys(raw)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      fail(`unknown key "${key}".`);
    }
  }

  if (typeof raw.source !== "string" || raw.source.length === 0) {
    fail(`"source" is required and must name an app under source/apps/.`);
  }
  if (raw.output !== undefined && typeof raw.output !== "string") fail(`"output" must be a string.`);
  if (raw.target !== undefined && typeof raw.target !== "string") fail(`"target" must be a string.`);
  if (raw["app-name"] !== undefined && typeof raw["app-name"] !== "string") fail(`"app-name" must be a string.`);
  if (raw.icon !== undefined && typeof raw.icon !== "string") fail(`"icon" must be a string.`);
  if (raw.bundle !== undefined && typeof raw.bundle !== "boolean") fail(`"bundle" must be a boolean.`);
  if (raw.minify !== undefined && typeof raw.minify !== "boolean") fail(`"minify" must be a boolean.`);
  if (raw["no-terminal"] !== undefined && typeof raw["no-terminal"] !== "boolean") {
    fail(`"no-terminal" must be a boolean.`);
  }
  if (raw["self-extracting"] !== undefined && typeof raw["self-extracting"] !== "boolean") {
    fail(`"self-extracting" must be a boolean.`);
  }
  if (raw["exclude-unused-npm"] !== undefined && typeof raw["exclude-unused-npm"] !== "boolean") {
    fail(`"exclude-unused-npm" must be a boolean.`);
  }
  if (raw.include !== undefined && !isStringArray(raw.include)) fail(`"include" must be a list of strings.`);
  if (raw.exclude !== undefined && !isStringArray(raw.exclude)) fail(`"exclude" must be a list of strings.`);

  return {
    ...raw,
    permissions: validatePermissions(raw.permissions),
  } as CompileConfig;
}

/**
 * Resolves a path from compile.yml. Absolute paths pass through unchanged.
 * "artifacts/..." and "packages/..." prefixes are replaced with ctx.artifacts
 * / ctx.packages; every other relative path is resolved against ctx.ship.
 */
function resolvePath(raw: string): string {
  if (isAbsolute(raw)) return raw;
  if (raw === "artifacts" || raw.startsWith("artifacts/")) {
    return join(ctx.artifacts, raw.slice("artifacts".length).replace(/^\/+/, ""));
  }
  if (raw === "packages" || raw.startsWith("packages/")) {
    return join(ctx.packages, raw.slice("packages".length).replace(/^\/+/, ""));
  }
  return join(ctx.ship, raw);
}

function permissionArgs(permissions: CompilePermissions | undefined): string[] {
  if (!permissions) return [];
  if (permissions["allow-all"]) return ["--allow-all"];

  const args: string[] = [];
  for (const key of ALLOW_KEYS) {
    const value = permissions[key];
    if (value === undefined || value === false) continue;
    args.push(value === true ? `--${key}` : `--${key}=${value.join(",")}`);
  }
  for (const key of DENY_KEYS) {
    const value = permissions[key];
    if (value === undefined || value.length === 0) continue;
    args.push(`--${key}=${value.join(",")}`);
  }
  return args;
}

const configPath = join(ctx.ship, "compile.yml");
if (!await exists(configPath, { isFile: true })) {
  throw new Error(`Missing compile.yml at ${configPath}`);
}
const config = validateConfig(parseYaml(await Deno.readTextFile(configPath)));

const workspace = dirname(ctx.artifacts);
const entrypoint = join(workspace, "apps", config.source, "main.ts");
if (!await exists(entrypoint, { isFile: true })) {
  throw new Error(`compile.yml: source "${config.source}" not found (expected ${entrypoint}).`);
}

// --output-name, when explicitly passed, overrides compile.yml's own `output:`.
const outputRelative = ctx.outputNameExplicit ? `${ctx.outputName}.exe` : (config.output ?? `${ctx.outputName}.exe`);
const output = join(ctx.packages, outputRelative);
await ensureDir(dirname(output));

const args: string[] = ["--output", output];
if (config.target) args.push("--target", config.target);
if (config["app-name"]) args.push("--app-name", config["app-name"]);
if (config.icon) args.push("--icon", resolvePath(config.icon));
if (config.bundle) args.push("--bundle");
if (config.minify) args.push("--minify");
if (config["no-terminal"]) args.push("--no-terminal");
if (config["self-extracting"]) args.push("--self-extracting");
if (config["exclude-unused-npm"]) args.push("--exclude-unused-npm");
for (const path of config.include ?? []) args.push("--include", resolvePath(path));
for (const path of config.exclude ?? []) args.push("--exclude", resolvePath(path));
args.push(...permissionArgs(config.permissions));

const denoExe = await resolveDenoExecutable();
const result = await $`${denoExe} compile -q ${args} ${entrypoint}`
  .env(ctx.vars)
  .noThrow();

Deno.exit(result.code);
