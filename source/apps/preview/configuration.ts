import { parse as parseYaml } from "@std/yaml";
import { BranchSlug } from "./branch-slug.ts";

/** What a manifest's per-environment variables take for a preview, unless a repository says otherwise: the network its gateway joins, the alias it answers to there, and the host its routes match. */
const DEFAULT_VARIABLES: Readonly<Record<string, string>> = {
  ingress_networks: "{network}",
  gateway_alias: "{slug}",
  public_host: "{host}",
};

const REPOSITORY_SLUG = /^[^/\s]+\/[^/\s]+$/;

/** One GitHub repository whose branches get previews, and how its delivery is deployed for them. */
export class Repository {
  constructor(
    readonly id: string,
    /** `owner/name`. */
    readonly name: string,
    private readonly branches: readonly RegExp[],
    readonly delivery: string,
    readonly kit: string,
    readonly envFiles: readonly string[],
    /** Manifest variable name → template over `{slug}`, `{host}`, `{network}` and `{branch}`. */
    readonly variables: Readonly<Record<string, string>>,
  ) {}

  tracks(branch: string): boolean {
    return this.branches.some((pattern) => pattern.test(branch));
  }

  /** The environment variable the secret verifying this repository's webhooks is delivered under — the same convention git-sync uses. */
  get webhookSecretEnvVar(): string {
    return `WEBHOOK_SECRET_${this.id.toUpperCase().replace(/-/g, "_")}`;
  }
}

/** A branch's preview: where it is checked out from and what it answers on. */
export class Preview {
  constructor(
    readonly repository: Repository,
    readonly branch: string,
    private readonly domain: string,
    private readonly network: string,
  ) {}

  get slug(): string {
    return BranchSlug.of(this.branch).value;
  }

  get host(): string {
    return `${this.slug}.${this.domain}`;
  }

  /**
   * The values the deployment's variables take for this preview, keyed by the
   * environment variable each is read from (`ens` names it after the variable,
   * uppercased). Everything else the manifest needs — secrets, credentials —
   * comes from this process's own environment and the repository's env files.
   */
  get environment(): Record<string, string> {
    const values: Record<string, string> = {
      "{slug}": this.slug,
      "{host}": this.host,
      "{network}": this.network,
      "{branch}": this.branch,
    };
    return Object.fromEntries(
      Object.entries(this.repository.variables).map(([name, template]) => [
        name.toUpperCase().replace(/-/g, "_"),
        template.replace(
          /\{(slug|host|network|branch)\}/g,
          (placeholder) => values[placeholder],
        ),
      ]),
    );
  }
}

/** What `preview.yml` declares: the domain previews live under and the repositories that get them. */
export class Configuration {
  constructor(
    /** Previews answer on `<slug>.<domain>`. */
    readonly domain: string,
    /** The Docker network the preview router and every preview's gateway share. */
    readonly network: string,
    /** Where branches are checked out, one directory per preview. */
    readonly workspace: string,
    readonly repositories: readonly Repository[],
  ) {}

  static parse(yaml: string): Configuration {
    const document = asRecord(parseYaml(yaml), "the configuration");
    const repositories = asRecord(document.repositories, "repositories");

    return new Configuration(
      asString(document.domain, "domain"),
      asString(document.network ?? "preview", "network"),
      asString(document.workspace, "workspace"),
      Object.entries(repositories).map(([id, entry]) =>
        Configuration.parseRepository(id, entry)
      ),
    );
  }

  repository(id: string): Repository | undefined {
    return this.repositories.find((repository) => repository.id === id);
  }

  previewOf(repository: Repository, branch: string): Preview {
    return new Preview(repository, branch, this.domain, this.network);
  }

  private static parseRepository(id: string, entry: unknown): Repository {
    const path = `repositories.${id}`;
    const fields = asRecord(entry, path);
    const name = asString(fields.repo, `${path}.repo`);
    if (!REPOSITORY_SLUG.test(name)) {
      throw new Error(`${path}.repo must look like "owner/name"`);
    }

    return new Repository(
      id,
      name,
      asStrings(fields.branches, `${path}.branches`).map(branchPattern),
      asString(fields.delivery, `${path}.delivery`),
      asString(fields.kit ?? "compose", `${path}.kit`),
      fields.envFiles === undefined
        ? []
        : asStrings(fields.envFiles, `${path}.envFiles`),
      {
        ...DEFAULT_VARIABLES,
        ...asStringMap(fields.variables ?? {}, `${path}.variables`),
      },
    );
  }
}

/** A branch name where `*` matches any run of characters, slashes included. */
function branchPattern(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(
    /\*/g,
    ".*",
  );
  return new RegExp(`^${escaped}$`);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be a mapping`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function asStrings(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} must be a non-empty list`);
  }
  return value.map((item, index) => asString(item, `${path}[${index}]`));
}

function asStringMap(value: unknown, path: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(asRecord(value, path)).map((
      [key, item],
    ) => [key, asString(item, `${path}.${key}`)]),
  );
}
