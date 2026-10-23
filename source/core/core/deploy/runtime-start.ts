/**
 * Whether `ens develop` brings up the local runtime the deploy kit's target
 * stands on (the proxy in front of a compose stack's gateways, the local AWS
 * a stack lands in): the `--no-runtime` flag, else the deployment's
 * `development.runtime` in `.ensemble/config.yaml`, else yes. Handed to the
 * kit's watch through the environment, which the kit's own scripts inherit.
 */
export class RuntimeStart {
  static readonly ENVIRONMENT_VARIABLE = "ENSEMBLE_START_RUNTIME";

  constructor(
    private readonly flag: boolean | undefined,
    private readonly configured: boolean | undefined,
  ) {}

  get enabled(): boolean {
    return this.flag ?? this.configured ?? true;
  }

  /** Puts the answer where the kit's scripts read it. */
  announce(): void {
    Deno.env.set(RuntimeStart.ENVIRONMENT_VARIABLE, String(this.enabled));
  }
}
