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
import {
  LAUNCH_TYPES,
  type LaunchDevelopment,
  type LaunchEntry,
  type LaunchType,
  type LaunchWatch,
} from "../launch.ts";
import { ManifestPath, type Problem } from "../problem.ts";
import { ManifestError } from "./errors.ts";
import { KeySuggester } from "./key-suggester.ts";
import { type Key, KEYS, namesOf, SUPPORTED_VERSIONS } from "./keys.ts";

/** A launch entry's `env` and `envSecrets` names become environment variables of the program started. */
const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** A task argument's name *is* an environment variable name the task reads, so it has to be a shell-safe identifier. */
const TASK_ARGUMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** What reading a manifest found: the workload it declares, and every problem with it. */
export interface Reading {
  /** Every entry that is at least a mapping, even one with problems — so later checks and an editor still see what the manifest names. Only trustworthy when `problems` is empty. */
  readonly workload: Workload;
  readonly problems: readonly Problem[];
}

/**
 * Parses manifest text into a `Workload`. Validates the envelope strictly
 * (unknown top-level/category/secret/external/release keys are rejected with
 * a near-miss suggestion) while leaving resource *types* open — per-type
 * field validation is the ContractRegistry's job, not this parser's.
 * Pure: no filesystem access — see `Loader` for reading a manifest off disk.
 */
export class Parser {
  constructor(
    private readonly keySuggester: KeySuggester = new KeySuggester(),
  ) {}

  /** The workload, or `ManifestError` naming every problem `read` finds. A YAML syntax error is thrown as the YAML parser's own. */
  parse(text: string): Workload {
    const { workload, problems } = this.read(text);
    if (problems.length > 0) throw new ManifestError(problems);
    return workload;
  }

  /** Reads the whole manifest, carrying on past each problem to find the rest. A YAML syntax error is thrown as the YAML parser's own: past one, there is no structure to read. */
  read(text: string): Reading {
    return new ManifestReading(this.keySuggester).of(parseYaml(text));
  }
}

/** One read of one manifest: the problems found so far, so every method can report one and carry on. */
class ManifestReading {
  private readonly problems: Problem[] = [];

  constructor(private readonly keySuggester: KeySuggester) {}

  of(root: unknown): Reading {
    const workload = this.workloadOf(root);
    return { workload, problems: this.problems };
  }

  private workloadOf(root: unknown): Workload {
    const manifest = ManifestPath.manifest();
    if (!this.isMapping(root, manifest)) return {};

    this.rejectUnknownKeys(root, KEYS.envelope, manifest);
    this.checkVersion(root.version, manifest.child("version"));

    const workload: Record<string, unknown> = {};
    if (root.release !== undefined) {
      workload.release = this.releasesOf(
        root.release,
        manifest.child("release"),
      );
    }
    if (root.tasks !== undefined) {
      workload.tasks = this.tasksOf(root.tasks, manifest.child("tasks"));
    }
    if (root.launch !== undefined) {
      workload.launch = this.launchOf(root.launch, manifest.child("launch"));
    }
    if (root.deploy !== undefined) {
      Object.assign(
        workload,
        this.deployOf(root.deploy, manifest.child("deploy")),
      );
    }
    return workload as Workload;
  }

  private deployOf(
    value: unknown,
    path: ManifestPath,
  ): Partial<Record<Category, Record<string, unknown>>> {
    if (!this.isMapping(value, path)) return {};
    this.rejectUnknownNames(value, CATEGORIES, path);

    const deploy: Partial<Record<Category, Record<string, unknown>>> = {};
    for (const category of CATEGORIES) {
      if (value[category] === undefined) continue;
      deploy[category] = this.categoryOf(
        category,
        value[category],
        path.child(category),
      );
    }
    return deploy;
  }

  private categoryOf(
    category: Category,
    value: unknown,
    path: ManifestPath,
  ): Record<string, unknown> {
    if (!this.isMapping(value, path)) return {};
    const parsed: Record<string, unknown> = {};

    for (const [name, entry] of Object.entries(value)) {
      const entryPath = path.child(name);
      const declaration = this.declarationOf(category, entry, entryPath);
      if (declaration !== undefined) parsed[name] = declaration;
    }

    return parsed;
  }

  private declarationOf(
    category: Category,
    entry: unknown,
    path: ManifestPath,
  ): unknown {
    switch (category) {
      case "secrets":
        return this.secretOf(entry, path);
      case "variables":
        return this.variableOf(entry, path);
      case "external":
        return this.externalOf(entry, path);
      default:
        return this.resourceOf(entry, path);
    }
  }

  /**
   * `tasks:` — named operator commands (`deploy/task.ts`), keyed by task name
   * like every category is keyed by resource name. Validated here rather than
   * by a contract, because no contract is involved: a task is nothing but a
   * command and the values it wants resolved.
   */
  private tasksOf(value: unknown, path: ManifestPath): Record<string, Task> {
    if (!this.isMapping(value, path)) return {};
    const parsed: Record<string, Task> = {};
    for (const [name, entry] of Object.entries(value)) {
      const task = this.taskOf(entry, path.child(name));
      if (task) parsed[name] = task;
    }
    return parsed;
  }

  private taskOf(value: unknown, path: ManifestPath): Task | undefined {
    if (!this.isMapping(value, path)) return undefined;
    this.rejectUnknownKeys(value, KEYS.task, path);

    const hasRun = value.run !== undefined;
    const hasScript = value.script !== undefined;
    if (hasRun === hasScript) {
      this.report(
        path,
        `${path} must declare exactly one of "run" (a shell one-liner) or "script" (a file under ci/<workload>/tasks/).`,
      );
    }
    if (hasRun && (typeof value.run !== "string" || value.run.length === 0)) {
      this.report(path.child("run"), `${path}.run must be a non-empty string.`);
    }
    if (hasScript) this.checkScriptPath(value.script, path);

    return {
      run: value.run as string | undefined,
      script: value.script as string | undefined,
      arguments: this.taskArgumentsOf(value.arguments, path.child("arguments")),
    };
  }

  /**
   * A task's script is a path *inside* `ci/<workload>/tasks/` — the core
   * spawns whatever this names, so absolute paths and any `..` segment are
   * rejected outright rather than resolved and checked later.
   */
  private checkScriptPath(value: unknown, task: ManifestPath): void {
    const path = task.child("script");
    if (typeof value !== "string" || value.length === 0) {
      this.report(path, `${path} must be a non-empty string.`);
      return;
    }
    const segments = value.split("/");
    if (value.startsWith("/") || segments.includes("..")) {
      this.report(
        path,
        `${path} must be a path inside the workload's own tasks/ folder (got "${value}").`,
      );
    }
  }

  private taskArgumentsOf(
    value: unknown,
    path: ManifestPath,
  ): Record<string, string | number | boolean> | undefined {
    if (value === undefined) return undefined;
    if (!this.isMapping(value, path)) return undefined;

    const parsed: Record<string, string | number | boolean> = {};
    for (const [name, argument] of Object.entries(value)) {
      const argumentPath = path.child(name);
      if (!TASK_ARGUMENT_NAME.test(name)) {
        this.report(
          argumentPath,
          `${argumentPath}: an argument name becomes an environment variable for the task, so it must be a shell-safe identifier (${TASK_ARGUMENT_NAME}) — a dash, say, would make "$${name}" read as a different variable in a shell.`,
        );
        continue;
      }
      const kind = typeof argument;
      if (kind !== "string" && kind !== "number" && kind !== "boolean") {
        this.report(
          argumentPath,
          `${argumentPath} must be a string, number, or boolean (or a \${...} reference to one).`,
        );
        continue;
      }
      parsed[name] = argument as string | number | boolean;
    }
    return parsed;
  }

  /**
   * `launch:` — what `ens develop` starts on this machine, keyed by name. Not a deploy category: no contract and no
   * kit is involved, so `ens deploy` ignores it. Validated here the way tasks are: it is an envelope, and `${...}`
   * references in its values are checked when the manifest is resolved, not now.
   */
  private launchOf(
    value: unknown,
    path: ManifestPath,
  ): Record<string, LaunchEntry> {
    if (!this.isMapping(value, path)) return {};
    const parsed: Record<string, LaunchEntry> = {};
    for (const [name, entry] of Object.entries(value)) {
      const launch = this.launchEntryOf(entry, path.child(name));
      if (launch) parsed[name] = launch;
    }
    return parsed;
  }

  private launchEntryOf(
    value: unknown,
    path: ManifestPath,
  ): LaunchEntry | undefined {
    if (!this.isMapping(value, path)) return undefined;
    this.rejectUnknownKeys(value, KEYS.launch, path);

    const expected = LAUNCH_TYPES.join(", ");
    const typePath = path.child("type");
    if (value.type === undefined) {
      this.report(
        typePath,
        `${typePath} is required (expected one of: ${expected}).`,
      );
      return undefined;
    }
    if (!(LAUNCH_TYPES as readonly unknown[]).includes(value.type)) {
      this.report(
        typePath,
        `${typePath} "${value.type}" is not supported (expected one of: ${expected}).`,
      );
      return undefined;
    }
    const type = value.type as LaunchType;

    return {
      type,
      command: this.launchCommandOf(type, value, path),
      package: type === "desktop" ? value.package as string : undefined,
      ports: this.launchPortsOf(value.ports, path.child("ports")),
      env: this.launchEnvOf(value.env, path.child("env")),
      envSecrets: this.launchEnvSecretsOf(
        value.envSecrets,
        path.child("envSecrets"),
      ),
      development: this.launchDevelopmentOf(
        value.development,
        path.child("development"),
      ),
    };
  }

  /** What the type starts: a process its command, a desktop app its package. Returns the command, if the type has one. */
  private launchCommandOf(
    type: LaunchType,
    raw: Record<string, unknown>,
    path: ManifestPath,
  ): readonly string[] | undefined {
    const command = path.child("command");
    const pack = path.child("package");
    if (type === "desktop") {
      if (raw.command !== undefined) {
        this.report(
          command,
          `${command} is for a process; a desktop app is started from its package.`,
        );
      }
      if (raw.package === undefined) {
        this.report(
          pack,
          `${pack} is required for a desktop app: the pack that holds it, as \${pack.<ship>}.`,
        );
      } else if (typeof raw.package !== "string" || raw.package.length === 0) {
        this.report(pack, `${pack} must be a non-empty string.`);
      }
      return undefined;
    }
    if (raw.package !== undefined) {
      this.report(
        pack,
        `${pack} is for a desktop app; a process is started from its command.`,
      );
    }
    if (raw.command === undefined) {
      this.report(
        command,
        `${command} is required for a process: the program and its arguments, as a list.`,
      );
      return undefined;
    }
    const parts = raw.command;
    if (
      !Array.isArray(parts) || parts.length === 0 ||
      parts.some((part) => typeof part !== "string" || part === "")
    ) {
      this.report(command, `${command} must be a non-empty list of strings.`);
      return undefined;
    }
    return parts as string[];
  }

  private launchPortsOf(
    value: unknown,
    path: ManifestPath,
  ): Record<string, number | "auto"> {
    if (value === undefined) return {};
    if (!this.isMapping(value, path)) return {};
    const ports: Record<string, number | "auto"> = {};
    for (const [name, port] of Object.entries(value)) {
      const valid = port === "auto" ||
        (Number.isInteger(port) && (port as number) > 0 &&
          (port as number) < 65536);
      if (!valid) {
        const portPath = path.child(name);
        this.report(portPath, `${portPath} must be a port number or "auto".`);
        continue;
      }
      ports[name] = port as number | "auto";
    }
    return ports;
  }

  private launchEnvOf(
    value: unknown,
    path: ManifestPath,
  ): Record<string, string | number | boolean> {
    if (value === undefined) return {};
    if (!this.isMapping(value, path)) return {};
    const env: Record<string, string | number | boolean> = {};
    for (const [name, setting] of Object.entries(value)) {
      const settingPath = path.child(name);
      if (!ENVIRONMENT_NAME.test(name)) {
        this.report(
          settingPath,
          `${path} has "${name}", which is not an environment variable name.`,
        );
        continue;
      }
      if (!["string", "number", "boolean"].includes(typeof setting)) {
        this.report(
          settingPath,
          `${settingPath} must be a string, a number or a boolean.`,
        );
        continue;
      }
      env[name] = setting as string | number | boolean;
    }
    return env;
  }

  private launchEnvSecretsOf(
    value: unknown,
    path: ManifestPath,
  ): Record<string, string> {
    if (value === undefined) return {};
    if (!this.isMapping(value, path)) return {};
    const envSecrets: Record<string, string> = {};
    for (const [name, secret] of Object.entries(value)) {
      const secretPath = path.child(name);
      if (!ENVIRONMENT_NAME.test(name)) {
        this.report(
          secretPath,
          `${path} has "${name}", which is not an environment variable name.`,
        );
        continue;
      }
      if (typeof secret !== "string" || secret === "") {
        this.report(secretPath, `${secretPath} must name a declared secret.`);
        continue;
      }
      envSecrets[name] = secret;
    }
    return envSecrets;
  }

  private launchDevelopmentOf(
    value: unknown,
    path: ManifestPath,
  ): LaunchDevelopment | undefined {
    if (value === undefined) return undefined;
    if (!this.isMapping(value, path)) return undefined;
    this.rejectUnknownKeys(value, KEYS.launchDevelopment, path);
    if (value.restart === undefined) return { restart: [] };
    const restart = path.child("restart");
    if (!Array.isArray(value.restart)) {
      this.report(restart, `${restart} must be a list.`);
      return { restart: [] };
    }
    const rules: LaunchWatch[] = [];
    value.restart.forEach((rule, index) => {
      const watch = this.launchWatchOf(rule, restart.child(index));
      if (watch) rules.push(watch);
    });
    return { restart: rules };
  }

  private launchWatchOf(
    value: unknown,
    path: ManifestPath,
  ): LaunchWatch | undefined {
    if (!this.isMapping(value, path)) return undefined;
    const keys = Object.keys(value);
    const named = keys.filter((key) => key === "build" || key === "pack");
    if (named.length !== 1 || keys.length !== 1) {
      this.report(path, `${path} must name exactly one of "build" or "pack".`);
      return undefined;
    }
    const kind = named[0];
    const name = value[kind];
    if (typeof name !== "string" || name === "") {
      this.report(path.child(kind), `${path}.${kind} must name a ${kind}.`);
      return undefined;
    }
    return kind === "build" ? { build: name } : { pack: name };
  }

  private resourceOf(
    value: unknown,
    path: ManifestPath,
  ): ResourceDeclaration | undefined {
    if (!this.isMapping(value, path)) return undefined;

    if (typeof value.type !== "string" || value.type.length === 0) {
      this.report(
        path.child("type"),
        `${path}.type is required and must be a string.`,
      );
    }
    if (value.class !== undefined && typeof value.class !== "string") {
      this.report(path.child("class"), `${path}.class must be a string.`);
    }
    if (value.capabilities !== undefined) {
      this.isMapping(value.capabilities, path.child("capabilities"));
    }

    const common = namesOf(KEYS.resource);
    const params: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      if (common.includes(key)) continue;
      params[key] = entryValue;
    }

    return {
      type: value.type as string,
      class: value.class as string | undefined,
      capabilities: value.capabilities as
        | Record<string, boolean | number>
        | undefined,
      params,
    };
  }

  private secretOf(
    value: unknown,
    path: ManifestPath,
  ): SecretDeclaration | undefined {
    if (!this.isMapping(value, path)) return undefined;
    this.rejectUnknownKeys(value, KEYS.secret, path);

    if (value.source !== "file" && value.source !== "environment") {
      this.report(
        path.child("source"),
        `${path}.source is required and must be "file" or "environment".`,
      );
    }
    return {
      source: value.source as SecretDeclaration["source"],
      ...this.descriptionOf(value.description, path),
    };
  }

  private variableOf(
    value: unknown,
    path: ManifestPath,
  ): VariableDeclaration | undefined {
    if (!this.isMapping(value, path)) return undefined;
    this.rejectUnknownKeys(value, KEYS.variable, path);

    if (value.default !== undefined && typeof value.default !== "string") {
      this.report(path.child("default"), `${path}.default must be a string.`);
    }
    const typed = value.type === undefined ||
      VARIABLE_TYPES.includes(value.type as VariableType);
    if (!typed) {
      this.report(
        path.child("type"),
        `${path}.type must be one of: ${VARIABLE_TYPES.join(", ")}.`,
      );
    }
    return {
      ...(value.type !== undefined && typed &&
        { type: value.type as VariableType }),
      default: value.default as string | undefined,
      ...this.descriptionOf(value.description, path),
    };
  }

  /** Spreads to nothing when absent, so a declaration without one keeps its exact shape. */
  private descriptionOf(
    value: unknown,
    path: ManifestPath,
  ): { description?: string } {
    if (value === undefined) return {};
    if (typeof value !== "string") {
      this.report(
        path.child("description"),
        `${path}.description must be a string.`,
      );
      return {};
    }
    return { description: value };
  }

  private externalOf(
    value: unknown,
    path: ManifestPath,
  ): ExternalDeclaration | undefined {
    if (!this.isMapping(value, path)) return undefined;
    this.rejectUnknownKeys(value, KEYS.external, path);

    if (typeof value.type !== "string" || value.type.length === 0) {
      this.report(
        path.child("type"),
        `${path}.type is required and must be a string.`,
      );
    }
    if (typeof value.name !== "string" || value.name.length === 0) {
      this.report(
        path.child("name"),
        `${path}.name is required and must be a string.`,
      );
    }
    return { type: value.type as string, name: value.name as string };
  }

  private releasesOf(
    value: unknown,
    path: ManifestPath,
  ): Record<string, Release> {
    if (!this.isMapping(value, path)) return {};
    const releases: Record<string, Release> = {};
    for (const [name, entry] of Object.entries(value)) {
      const release = this.releaseOf(entry, path.child(name));
      if (release) releases[name] = release;
    }
    return releases;
  }

  private releaseOf(value: unknown, path: ManifestPath): Release | undefined {
    if (!this.isMapping(value, path)) return undefined;
    this.rejectUnknownKeys(value, KEYS.release, path);

    if (typeof value.kit !== "string" || value.kit.length === 0) {
      this.report(
        path.child("kit"),
        `${path}.kit is required and must be a string.`,
      );
    }
    if (value.mode !== undefined && typeof value.mode !== "string") {
      this.report(path.child("mode"), `${path}.mode must be a string.`);
    }
    if (
      value.outputName !== undefined && typeof value.outputName !== "string"
    ) {
      this.report(
        path.child("outputName"),
        `${path}.outputName must be a string.`,
      );
    }

    return {
      kit: value.kit as string,
      mode: value.mode as string | undefined,
      outputName: value.outputName as string | undefined,
      publish: value.publish === undefined
        ? undefined
        : this.publishOf(value.publish, path.child("publish")),
    };
  }

  private publishOf(
    value: unknown,
    path: ManifestPath,
  ): PublishSpec | undefined {
    if (!this.isMapping(value, path)) return undefined;
    this.rejectUnknownKeys(value, KEYS.publish, path);

    if (typeof value.target !== "string" || value.target.length === 0) {
      this.report(
        path.child("target"),
        `${path}.target is required and must be a string.`,
      );
    }
    if (value.name !== undefined && typeof value.name !== "string") {
      this.report(path.child("name"), `${path}.name must be a string.`);
    }
    const options = value.options === undefined ||
      this.isMapping(value.options, path.child("options"));

    return {
      target: value.target as string,
      name: value.name as string | undefined,
      options: options
        ? (value.options as Record<string, string> | undefined) ?? {}
        : {},
    };
  }

  private checkVersion(version: unknown, path: ManifestPath): void {
    const expected = SUPPORTED_VERSIONS.join(", ");
    if (version === undefined) {
      this.report(path, `${path} is required (expected one of: ${expected}).`);
      return;
    }
    if (
      typeof version !== "string" ||
      !(SUPPORTED_VERSIONS as readonly string[]).includes(version)
    ) {
      this.report(
        path,
        `${path} "${
          String(version)
        }" is not supported (expected one of: ${expected}).`,
      );
    }
  }

  private rejectUnknownKeys(
    object: Record<string, unknown>,
    keys: readonly Key[],
    path: ManifestPath,
  ): void {
    this.rejectUnknownNames(object, namesOf(keys), path);
  }

  private rejectUnknownNames(
    object: Record<string, unknown>,
    known: readonly string[],
    path: ManifestPath,
  ): void {
    for (const key of Object.keys(object)) {
      if (known.includes(key)) continue;
      const suggestion = this.keySuggester.suggestFor(key, known);
      const hint = suggestion ? ` Did you mean "${suggestion}"?` : "";
      this.report(
        path.child(key),
        `${path} has an unknown key "${key}".${hint}`,
      );
    }
  }

  /** Whether `value` is a mapping, reporting that it must be one when it isn't. */
  private isMapping(
    value: unknown,
    path: ManifestPath,
  ): value is Record<string, unknown> {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return true;
    }
    this.report(path, `${path} must be a mapping.`);
    return false;
  }

  private report(path: ManifestPath, message: string): void {
    this.problems.push(path.problem(message));
  }
}
