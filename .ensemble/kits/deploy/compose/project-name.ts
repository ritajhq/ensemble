/**
 * How docker compose names what a deployment brings up. `ens` hands compose
 * the deployment's name as the project (`-p`), and compose cleans a project
 * name before using it — lowercase, only letters, digits, `-` and `_`, no
 * leading `-` or `_` — and names each container `<project>-<service>-<n>`.
 * That container name is what resolves on every network the container joins,
 * and is not ambiguous the way a bare service name is on a network that
 * several deployments share.
 */
export class ComposeProject {
  constructor(private readonly deployment: string) {}

  get name(): string {
    return this.deployment
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .replace(/^[-_]+/, "");
  }

  /** The first replica of `service`, which is the only one compose ever starts here: a compute's `replicas` isn't rendered. */
  containerOf(service: string): string {
    return `${this.name}-${service}-1`;
  }
}
