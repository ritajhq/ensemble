/**
 * One of several concurrent deployments of the same delivery manifest — a
 * preview of a branch beside the main stack, say. The manifest (and so
 * everything declared in it) is shared; what an instance owns is only its
 * identity: the scope its deployment name, rendered artifact, render cache
 * and task snapshot live under, so none of them collide with another
 * instance's or with the un-instanced deployment's.
 *
 * Which hostname an instance answers on is deliberately *not* decided here:
 * that is a value the pipeline puts into the environment, like every other
 * per-environment value.
 */
export class Instance {
  /** A DNS label, since it ends up in hostnames and compose project names: lowercase, digits and hyphens, not starting or ending with a hyphen, and short enough to leave room for the rest of a 63-character label. */
  private static readonly LABEL = /^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$/;

  private constructor(readonly slug: string) {}

  static parse(value: string): Instance {
    if (!Instance.LABEL.test(value)) {
      throw new Error(
        `Invalid instance "${value}": use lowercase letters, digits and hyphens (1-50 characters, not starting or ending with a hyphen).`,
      );
    }
    return new Instance(value);
  }

  /** The scope `workload`'s deployment lives under for this instance; the un-instanced deployment keeps the bare `workload` name. */
  scope(workload: string): string {
    return `${workload}--${this.slug}`;
  }
}
