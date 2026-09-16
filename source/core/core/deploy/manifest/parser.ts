import { parse as parseYaml } from "@std/yaml";
import { CATEGORIES, type Category, type Workload } from "../workload.ts";
import type {
  ExternalDeclaration,
  ResourceDeclaration,
  SecretDeclaration,
  VariableDeclaration,
} from "../resource.ts";
import type { PublishSpec, Release } from "../release.ts";
import { ManifestError } from "./errors.ts";
import { KeySuggester } from "./key-suggester.ts";

const SUPPORTED_VERSIONS = ["v1"];
const ENVELOPE_KEYS = ["version", "release", "deploy"] as const;
const RELEASE_KEYS = ["kit", "mode", "outputName", "publish"] as const;
const PUBLISH_KEYS = ["target", "name", "options"] as const;
const SECRET_KEYS = ["source"] as const;
const EXTERNAL_KEYS = ["type", "name"] as const;
const RESOURCE_COMMON_KEYS = ["type", "class", "capabilities"] as const;

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
    } & Record<Category, Record<string, unknown> | undefined> = {} as never;

    if (envelope.release !== undefined) {
      workload.release = this.parseReleases(envelope.release);
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
    return { source: raw.source };
  }

  private parseVariable(value: unknown, path: string): VariableDeclaration {
    this.assertPlainObject(value, path);
    return { params: value as Record<string, unknown> };
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
