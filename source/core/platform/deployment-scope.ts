/**
 * `<checkout>/source/artifacts/deploy/<scope>/<artifact>`: where `ens deploy`
 * writes what it renders. A scope is a manifest's name, then `--<instance>`
 * for any deployment beside its plain one.
 */
const RENDERED = /^(.+)\/source\/artifacts\/deploy\/([^/]+)\/[^/]+$/;

/** What sets an instance's scope apart from its manifest's name. */
const INSTANCE_SEPARATOR = "--";

/**
 * Which checkout, manifest and instance a deployment came from, read back
 * from where `ens deploy` rendered it: the one trace of `ens` every
 * deployment keeps, whoever ran the deploy.
 */
export class DeploymentScope {
  private constructor(
    /** The checkout it was deployed from: a path on the machine that deployed it. */
    readonly checkout: string,
    readonly manifest: string,
    /** None for the manifest's plain deployment. */
    readonly instance?: string,
  ) {}

  /** The scope of the deployment rendered at `artifact`; none when `ens deploy` didn't render it. */
  static ofArtifact(artifact: string): DeploymentScope | undefined {
    const match = RENDERED.exec(artifact);
    if (!match) return undefined;
    const [, checkout, scope] = match;
    const split = scope.indexOf(INSTANCE_SEPARATOR);
    if (split === -1) return new DeploymentScope(checkout, scope);
    return new DeploymentScope(
      checkout,
      scope.slice(0, split),
      scope.slice(split + INSTANCE_SEPARATOR.length),
    );
  }
}
