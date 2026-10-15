import { BranchSlug } from "./branch-slug.ts";
import { Fingerprint } from "./fingerprint.ts";

/** Thrown when a preview template names a placeholder there is no value for. */
export class InvalidTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTemplateError";
  }
}

/** The longest a DNS label may be. */
const LABEL_LENGTH = 63;

/** Every `{name}` or `{name:argument}` in a template. */
const PLACEHOLDER = /\{([^{}:]+)(?::([^{}]*))?\}/g;

/** A subdomain a template may ask the public host of: a dotted run of labels. */
const SUBDOMAIN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

/**
 * One branch of a project, deployed from its own checkout as an instance of
 * one delivery manifest beside that manifest's environments.
 *
 * Inside, it answers on an internal domain only its gateway ever sees
 * (`<slug>.<project>.preview.internal`); outside, each host it answers on is
 * published as one label under the preview domain —
 * `dashboard.<internal>` as `dashboard--<slug>--<project>.<domain>`, the
 * internal domain itself as `<slug>--<project>.<domain>` — so a single
 * wildcard certificate covers every preview, and the router rewrites the
 * host back on the way in.
 */
export class Preview {
  /** What every preview's instance starts with, so none is ever named like an environment. */
  static readonly INSTANCE_PREFIX = "preview-";

  private constructor(
    readonly project: string,
    readonly manifest: string,
    readonly branch: string,
    readonly slug: string,
    /** The public domain previews answer under (`ensemble.blue`). */
    readonly domain: string,
  ) {}

  static of(
    fields: {
      project: string;
      manifest: string;
      branch: string;
      domain: string;
    },
  ): Preview {
    return new Preview(
      fields.project,
      fields.manifest,
      fields.branch,
      BranchSlug.of(fields.branch).value,
      fields.domain,
    );
  }

  /** The instance it is deployed as. */
  get instance(): string {
    return `${Preview.INSTANCE_PREFIX}${this.slug}`;
  }

  /** Whose its routes are, as `<project>/<manifest>/<instance>`. */
  get owner(): string {
    return `${this.project}/${this.manifest}/${this.instance}`;
  }

  /** The domain it answers on inside: what its manifest's own host variables are set under. */
  get internalDomain(): string {
    return `${this.slug}.${this.project}.preview.internal`;
  }

  /** The public host for the internal domain's `subdomain` (none: the internal domain itself). */
  publicHost(subdomain?: string): string {
    const parts = [
      ...(subdomain ? [subdomain.replaceAll(".", "-")] : []),
      this.slug,
      this.project,
    ];
    const label = parts.join("--");
    return `${this.fitted(label)}.${this.domain}`;
  }

  /** The public host an internal host is published as; none for a host outside the internal domain, which is never published. */
  publicHostOf(internalHost: string): string | undefined {
    const internal = this.internalDomain;
    if (internalHost === internal) return this.publicHost();
    if (!internalHost.endsWith(`.${internal}`)) return undefined;
    return this.publicHost(internalHost.slice(0, -(internal.length + 1)));
  }

  /**
   * A template with this preview's values in: `{slug}`, `{branch}`,
   * `{internal}` (its internal domain), `{host}` (its public apex host) and
   * `{host:<sub>}` (the public host of `<sub>.<internal>`).
   */
  render(template: string): string {
    return template.replace(
      PLACEHOLDER,
      (_, name: string, argument?: string) =>
        this.value(name, argument, template),
    );
  }

  /** Throws `InvalidTemplateError` unless every placeholder in `template` has a value. */
  static check(template: string): void {
    Preview.of({
      project: "project",
      manifest: "manifest",
      branch: "branch",
      domain: "example.com",
    }).render(template);
  }

  private value(
    name: string,
    argument: string | undefined,
    template: string,
  ): string {
    const values: Readonly<Record<string, () => string>> = {
      slug: () => this.slug,
      branch: () => this.branch,
      internal: () => this.internalDomain,
      host: () => this.hostOf(argument, template),
    };
    const value = values[name];
    if (!value || (argument !== undefined && name !== "host")) {
      throw new InvalidTemplateError(
        `"${template}" names {${name}${
          argument === undefined ? "" : `:${argument}`
        }}; a preview has {slug}, {branch}, {internal}, {host} and {host:<subdomain>}.`,
      );
    }
    return value();
  }

  private hostOf(subdomain: string | undefined, template: string): string {
    if (subdomain === undefined) return this.publicHost();
    if (!SUBDOMAIN.test(subdomain)) {
      throw new InvalidTemplateError(
        `"${template}" asks for the host of "${subdomain}", which isn't a subdomain.`,
      );
    }
    return this.publicHost(subdomain);
  }

  /** `label`, or — too long for one — its start and a fingerprint of the whole, so it stays one label and stays unique. */
  private fitted(label: string): string {
    if (label.length <= LABEL_LENGTH) return label;
    const stem = label
      .slice(0, LABEL_LENGTH - Fingerprint.LENGTH - 1)
      .replace(/-+$/, "");
    return `${stem}-${Fingerprint.of(label)}`;
  }
}
