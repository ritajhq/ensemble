import { parse as parseYaml } from "@std/yaml";
import { CATEGORIES, type Category, type Workload } from "../workload.ts";
import type {
  ExternalDeclaration,
  ResourceDeclaration,
  SecretDeclaration,
  VariableDeclaration,
  VariableType,
} from "../resource.ts";
import { VARIABLE_TYPES } from "../resource.ts";
import type { PublishSpec, Release } from "../release.ts";
import type { Task } from "../task.ts";
import { LAUNCH_TYPES, type LaunchDevelopment, type LaunchEntry, type LaunchType, type LaunchWatch } from "../launch.ts";
import { ManifestError } from "./errors.ts";
import { KeySuggester } from "./key-suggester.ts";

const SUPPORTED_VERSIONS = ["v1"];
const ENVELOPE_KEYS = ["version", "release", "deploy", "tasks", "launch"] as const;
const RELEASE_KEYS = ["kit", "mode", "outputName", "publish"] as const;
const PUBLISH_KEYS = ["target", "name", "options"] as const;
const SECRET_KEYS = ["source", "description"] as const;
const VARIABLE_KEYS = ["type", "default", "description"] as const;
const EXTERNAL_KEYS = ["type", "name"] as const;
const RESOURCE_COMMON_KEYS = ["type", "class", "capabilities"] as const;
const TASK_KEYS = ["run", "script", "arguments"] as const;
const LAUNCH_KEYS = ["type", "command", "package", "ports", "env", "envSecrets", "development"] as const;
const LAUNCH_DEVELOPMENT_KEYS = ["restart"] as const;
/** A launch entry's `env` and `envSecrets` names become environment variables of the program started. */
const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** A task argument's name *is* an environment variable name the task reads, so it has to be a shell-safe identifier. */
const TASK_ARGUMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Parses manifest text into a `Workload`. Validates the envelope strictly
 * (unknown top-level/category/secret/external/release keys are rejected with
 * a near-miss suggestion) while leaving resource *types* open — per-type
 * field validation is the ContractRegistry's job (Phase 2), not this parser's.
 * Pure: no filesystem access — see `Loader` for reading a manifest off disk.
 */
export class Parser {
  constructor(
    private readonly keySuggester: KeySuggester = new KeySuggester(),
  ) {}

  parse(text: string): Workload {
    const root = parseYaml(text);
    this.assertPlainObject(root, "manifest");
    const envelope = root as Record<string, unknown>;

    this.rejectUnknownKeys(envelope, ENVELOPE_KEYS, "manifest");
    this.validateVersion(envelope.version);

    const workload: {
      release?: Record<string, Release>;
      tasks?: Record<string, Task>;
      launch?: Record<string, LaunchEntry>;
    } & Record<Category, Record<string, unknown> | undefined> = {} as never;

    if (envelope.release !== undefined) {
      workload.release = this.parseReleases(envelope.release);
    }

    if (envelope.tasks !== undefined) {
      workload.tasks = this.parseTasks(envelope.tasks);
    }

    if (envelope.launch !== undefined) {
      workload.launch = this.parseLaunch(envelope.launch);
    }

    if (envelope.deploy !== undefined) {
      this.assertPlainObject(envelope.deploy, "manifest.deploy");
      const deploy = envelope.deploy as Record<string, unknown>;
      this.rejectUnknownKeys(deploy, CATEGORIES, "manifest.deploy");

      for (const category of CATEGORIES) {
        if (deploy[category] === undefined) continue;
        workload[category] = this.parseCategory(category, deploy[category]);
      }
    }

    return workload as Workload;
  }

  private parseCategory(
    category: Category,
    value: unknown,
  ): Record<string, unknown> {
    this.assertPlainObject(value, `manifest.deploy.${category}`);
    const entries = value as Record<string, unknown>;
    const parsed: Record<string, unknown> = {};

    for (const [name, entry] of Object.entries(entries)) {
      const path = `manifest.deploy.${category}.${name}`;
      switch (category) {
        case "secrets":
          parsed[name] = this.parseSecret(entry, path);
          break;
        case "variables":
          parsed[name] = this.parseVariable(entry, path);
          break;
        case "external":
          parsed[name] = this.parseExternal(entry, path);
          break;
        default:
          parsed[name] = this.parseResource(entry, path);
      }
    }

    return parsed;
  }

  /**
   * `tasks:` — named operator commands (`deploy/task.ts`), keyed by task name
   * like every category is keyed by resource name. Validated here rather than
   * by a contract, because no contract is involved: a task is nothing but a
   * command and the values it wants resolved.
   */
  private parseTasks(value: unknown): Record<string, Task> {
    this.assertPlainObject(value, "manifest.tasks");
    const parsed: Record<string, Task> = {};

    for (
      const [name, entry] of Object.entries(value as Record<string, unknown>)
    ) {
      parsed[name] = this.parseTask(entry, `manifest.tasks.${name}`);
    }

    return parsed;
  }

  /**
   * `launch:` — what `ens develop` starts on this machine, keyed by name. Not a deploy category: no contract and no
   * kit is involved, so `ens deploy` ignores it. Validated here the way tasks are: it is an envelope, and `${...}`
   * references in its values are checked when the manifest is resolved, not now.
   */
  private parseLaunch(value: unknown): Record<string, LaunchEntry> {
    this.assertPlainObject(value, "manifest.launch");
    const parsed: Record<string, LaunchEntry> = {};
    for (const [name, entry] of Object.entries(value)) {
      parsed[name] = this.parseLaunchEntry(entry, `manifest.launch.${name}`);
    }
    return parsed;
  }

  private parseLaunchEntry(value: unknown, path: string): LaunchEntry {
    this.assertPlainObject(value, path);
    const raw = value as Record<string, unknown>;
    this.rejectUnknownKeys(raw, LAUNCH_KEYS, path);

    const expected = LAUNCH_TYPES.join(", ");
    if (raw.type === undefined) {
      throw new ManifestError(`${path}.type is required (expected one of: ${expected}).`);
    }
    if (!(LAUNCH_TYPES as readonly unknown[]).includes(raw.type)) {
      throw new ManifestError(`${path}.type "${raw.type}" is not supported (expected one of: ${expected}).`);
    }
    const type = raw.type as LaunchType;

    const entry = {
      type,
      command: this.parseLaunchRunnable(type, raw, path),
      package: type === "desktop" ? raw.package as string : undefined,
      ports: this.parseLaunchPorts(raw.ports, path),
      env: this.parseLaunchEnv(raw.env, path),
      envSecrets: this.parseLaunchEnvSecrets(raw.envSecrets, path),
      development: this.parseLaunchDevelopment(raw.development, path),
    };
    return entry;
  }

  /** What the type starts: a process its command, a desktop app its package. Returns the command, if the type has one. */
  private parseLaunchRunnable(
    type: LaunchType,
    raw: Record<string, unknown>,
    path: string,
  ): readonly string[] | undefined {
    if (type === "desktop") {
      if (raw.command !== undefined) {
        throw new ManifestError(`${path}.command is for a process; a desktop app is started from its package.`);
      }
      if (raw.package === undefined) {
        throw new ManifestError(
          `${path}.package is required for a desktop app: the pack that holds it, as \${pack.<ship>}.`,
        );
      }
      if (typeof raw.package !== "string" || raw.package.length === 0) {
        throw new ManifestError(`${path}.package must be a non-empty string.`);
      }
      return undefined;
    }
    if (raw.package !== undefined) {
      throw new ManifestError(`${path}.package is for a desktop app; a process is started from its command.`);
    }
    if (raw.command === undefined) {
      throw new ManifestError(
        `${path}.command is required for a process: the program and its arguments, as a list.`,
      );
    }
    const command = raw.command;
    if (
      !Array.isArray(command) || command.length === 0 || command.some((part) => typeof part !== "string" || part === "")
    ) {
      throw new ManifestError(`${path}.command must be a non-empty list of strings.`);
    }
    return command as string[];
  }

  private parseLaunchPorts(value: unknown, path: string): Record<string, number | "auto"> {
    if (value === undefined) return {};
    this.assertPlainObject(value, `${path}.ports`);
    for (const [name, port] of Object.entries(value)) {
      const valid = port === "auto" || (Number.isInteger(port) && (port as number) > 0 && (port as number) < 65536);
      if (!valid) throw new ManifestError(`${path}.ports.${name} must be a port number or "auto".`);
    }
    return { ...value } as Record<string, number | "auto">;
  }

  private parseLaunchEnv(value: unknown, path: string): Record<string, string | number | boolean> {
    if (value === undefined) return {};
    this.assertPlainObject(value, `${path}.env`);
    for (const [name, setting] of Object.entries(value)) {
      if (!ENVIRONMENT_NAME.test(name)) {
        throw new ManifestError(`${path}.env has "${name}", which is not an environment variable name.`);
      }
      if (!["string", "number", "boolean"].includes(typeof setting)) {
        throw new ManifestError(`${path}.env.${name} must be a string, a number or a boolean.`);
      }
    }
    return { ...value } as Record<string, string | number | boolean>;
  }

  private parseLaunchEnvSecrets(value: unknown, path: string): Record<string, string> {
    if (value === undefined) return {};
    this.assertPlainObject(value, `${path}.envSecrets`);
    for (const [name, secret] of Object.entries(value)) {
      if (!ENVIRONMENT_NAME.test(name)) {
        throw new ManifestError(`${path}.envSecrets has "${name}", which is not an environment variable name.`);
      }
      if (typeof secret !== "string" || secret === "") {
        throw new ManifestError(`${path}.envSecrets.${name} must name a declared secret.`);
      }
    }
    return { ...value } as Record<string, string>;
  }

  private parseLaunchDevelopment(value: unknown, path: string): LaunchDevelopment | undefined {
    if (value === undefined) return undefined;
    const block = `${path}.development`;
    this.assertPlainObject(value, block);
    this.rejectUnknownKeys(value, LAUNCH_DEVELOPMENT_KEYS, block);
    if (value.restart === undefined) return { restart: [] };
    if (!Array.isArray(value.restart)) throw new ManifestError(`${block}.restart must be a list.`);
    return { restart: value.restart.map((rule, index) => this.parseLaunchWatch(rule, `${block}.restart[${index}]`)) };
  }

  private parseLaunchWatch(value: unknown, path: string): LaunchWatch {
    this.assertPlainObject(value, path);
    const keys = Object.keys(value);
    const named = keys.filter((key) => key === "build" || key === "pack");
    if (named.length !== 1 || keys.length !== 1) {
      throw new ManifestError(`${path} must name exactly one of "build" or "pack".`);
    }
    const name = value[named[0]];
    if (typeof name !== "string" || name === "") {
      throw new ManifestError(`${path}.${named[0]} must name a ${named[0]}.`);
    }
    return named[0] === "build" ? { build: name } : { pack: name };
  }

  private parseTask(value: unknown, path: string): Task {
    this.assertPlainObject(value, path);
    const raw = value as Record<string, unknown>;
    this.rejectUnknownKeys(raw, TASK_KEYS, path);

    const hasRun = raw.run !== undefined;
    const hasScript = raw.script !== undefined;
    if (hasRun === hasScript) {
      throw new ManifestError(
        `${path} must declare exactly one of "run" (a shell one-liner) or "script" (a file under ci/<workload>/tasks/).`,
      );
    }
    if (hasRun && (typeof raw.run !== "string" || raw.run.length === 0)) {
      throw new ManifestError(`${path}.run must be a non-empty string.`);
    }
    if (hasScript) this.assertScriptPath(raw.script, path);

    return {
      run: raw.run as string | undefined,
      script: raw.script as string | undefined,
      arguments: this.parseTaskArguments(raw.arguments, path),
    };
  }

  /**
   * A task's script is a path *inside* `ci/<workload>/tasks/` — the core
   * spawns whatever this names, so absolute paths and any `..` segment are
   * rejected outright rather than resolved and checked later.
   */
  private assertScriptPath(value: unknown, path: string): void {
    if (typeof value !== "string" || value.length === 0) {
      throw new ManifestError(`${path}.script must be a non-empty string.`);
    }
    const segments = value.split("/");
    if (value.startsWith("/") || segments.includes("..")) {
      throw new ManifestError(
        `${path}.script must be a path inside the workload's own tasks/ folder (got "${value}").`,
      );
    }
  }

  private parseTaskArguments(
    value: unknown,
    path: string,
  ): Record<string, string | number | boolean> | undefined {
    if (value === undefined) return undefined;
    this.assertPlainObject(value, `${path}.arguments`);

    const parsed: Record<string, string | number | boolean> = {};
    for (
      const [name, argument] of Object.entries(
        value as Record<string, unknown>,
      )
    ) {
      if (!TASK_ARGUMENT_NAME.test(name)) {
        throw new ManifestError(
          `${path}.arguments.${name}: an argument name becomes an environment variable for the task, so it must be a shell-safe identifier (${TASK_ARGUMENT_NAME}) — a dash, say, would make "$${name}" read as a different variable in a shell.`,
        );
      }
      const kind = typeof argument;
      if (kind !== "string" && kind !== "number" && kind !== "boolean") {
        throw new ManifestError(
          `${path}.arguments.${name} must be a string, number, or boolean (or a \${...} reference to one).`,
        );
      }
      parsed[name] = argument as string | number | boolean;
    }

    return parsed;
  }

  private parseResource(value: unknown, path: string): ResourceDeclaration {
    this.assertPlainObject(value, path);
    const raw = value as Record<string, unknown>;

    if (typeof raw.type !== "string" || raw.type.length === 0) {
      throw new ManifestError(`${path}.type is required and must be a string.`);
    }
    if (raw.class !== undefined && typeof raw.class !== "string") {
      throw new ManifestError(`${path}.class must be a string.`);
    }
    if (raw.capabilities !== undefined) {
      this.assertPlainObject(raw.capabilities, `${path}.capabilities`);
    }

    const params: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(raw)) {
      if ((RESOURCE_COMMON_KEYS as readonly string[]).includes(key)) continue;
      params[key] = entryValue;
    }

    return {
      type: raw.type,
      class: raw.class as string | undefined,
      capabilities: raw.capabilities as
        | Record<string, boolean | number>
        | undefined,
      params,
    };
  }

  private parseSecret(value: unknown, path: string): SecretDeclaration {
    this.assertPlainObject(value, path);
    const raw = value as Record<string, unknown>;
    this.rejectUnknownKeys(raw, SECRET_KEYS, path);

    if (raw.source !== "file" && raw.source !== "environment") {
      throw new ManifestError(
        `${path}.source is required and must be "file" or "environment".`,
      );
    }
    return {
      source: raw.source,
      ...this.parseDescription(raw.description, path),
    };
  }

  private parseVariable(value: unknown, path: string): VariableDeclaration {
    this.assertPlainObject(value, path);
    const raw = value as Record<string, unknown>;
    this.rejectUnknownKeys(raw, VARIABLE_KEYS, path);

    if (raw.default !== undefined && typeof raw.default !== "string") {
      throw new ManifestError(`${path}.default must be a string.`);
    }
    if (
      raw.type !== undefined &&
      !VARIABLE_TYPES.includes(raw.type as VariableType)
    ) {
      throw new ManifestError(
        `${path}.type must be one of: ${VARIABLE_TYPES.join(", ")}.`,
      );
    }
    return {
      ...(raw.type !== undefined && { type: raw.type as VariableType }),
      default: raw.default as string | undefined,
      ...this.parseDescription(raw.description, path),
    };
  }

  /** Spreads to nothing when absent, so a declaration without one keeps its exact shape. */
  private parseDescription(
    value: unknown,
    path: string,
  ): { description?: string } {
    if (value === undefined) return {};
    if (typeof value !== "string") {
      throw new ManifestError(`${path}.description must be a string.`);
    }
    return { description: value };
  }

  private parseExternal(value: unknown, path: string): ExternalDeclaration {
    this.assertPlainObject(value, path);
    const raw = value as Record<string, unknown>;
    this.rejectUnknownKeys(raw, EXTERNAL_KEYS, path);

    if (typeof raw.type !== "string" || raw.type.length === 0) {
      throw new ManifestError(`${path}.type is required and must be a string.`);
    }
    if (typeof raw.name !== "string" || raw.name.length === 0) {
      throw new ManifestError(`${path}.name is required and must be a string.`);
    }
    return { type: raw.type, name: raw.name };
  }

  private parseReleases(value: unknown): Record<string, Release> {
    this.assertPlainObject(value, "manifest.release");
    const entries = value as Record<string, unknown>;
    const releases: Record<string, Release> = {};

    for (const [name, entry] of Object.entries(entries)) {
      const path = `manifest.release.${name}`;
      this.assertPlainObject(entry, path);
      const raw = entry as Record<string, unknown>;
      this.rejectUnknownKeys(raw, RELEASE_KEYS, path);

      if (typeof raw.kit !== "string" || raw.kit.length === 0) {
        throw new ManifestError(
          `${path}.kit is required and must be a string.`,
        );
      }
      if (raw.mode !== undefined && typeof raw.mode !== "string") {
        throw new ManifestError(`${path}.mode must be a string.`);
      }
      if (raw.outputName !== undefined && typeof raw.outputName !== "string") {
        throw new ManifestError(`${path}.outputName must be a string.`);
      }

      let publish: PublishSpec | undefined;
      if (raw.publish !== undefined) {
        publish = this.parsePublish(raw.publish, `${path}.publish`);
      }

      releases[name] = {
        kit: raw.kit,
        mode: raw.mode as string | undefined,
        outputName: raw.outputName as string | undefined,
        publish,
      };
    }

    return releases;
  }

  private parsePublish(value: unknown, path: string): PublishSpec {
    this.assertPlainObject(value, path);
    const raw = value as Record<string, unknown>;
    this.rejectUnknownKeys(raw, PUBLISH_KEYS, path);

    if (typeof raw.target !== "string" || raw.target.length === 0) {
      throw new ManifestError(
        `${path}.target is required and must be a string.`,
      );
    }
    if (raw.name !== undefined && typeof raw.name !== "string") {
      throw new ManifestError(`${path}.name must be a string.`);
    }
    if (raw.options !== undefined) {
      this.assertPlainObject(raw.options, `${path}.options`);
    }

    return {
      target: raw.target,
      name: raw.name as string | undefined,
      options: (raw.options as Record<string, string> | undefined) ?? {},
    };
  }

  private validateVersion(version: unknown): void {
    if (version === undefined) {
      throw new ManifestError(
        `manifest.version is required (expected one of: ${
          SUPPORTED_VERSIONS.join(", ")
        }).`,
      );
    }
    if (typeof version !== "string" || !SUPPORTED_VERSIONS.includes(version)) {
      throw new ManifestError(
        `manifest.version "${
          String(version)
        }" is not supported (expected one of: ${
          SUPPORTED_VERSIONS.join(", ")
        }).`,
      );
    }
  }

  private rejectUnknownKeys(
    object: Record<string, unknown>,
    knownKeys: readonly string[],
    path: string,
  ): void {
    for (const key of Object.keys(object)) {
      if ((knownKeys as readonly string[]).includes(key)) continue;
      const suggestion = this.keySuggester.suggestFor(key, knownKeys);
      const hint = suggestion ? ` Did you mean "${suggestion}"?` : "";
      throw new ManifestError(`${path} has an unknown key "${key}".${hint}`);
    }
  }

  private assertPlainObject(
    value: unknown,
    path: string,
  ): asserts value is Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new ManifestError(`${path} must be a mapping.`);
    }
  }
}
