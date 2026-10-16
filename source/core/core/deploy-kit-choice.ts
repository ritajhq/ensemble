import { EnsembleConfigStore } from "./config.ts";

/** Thrown when nothing names the deploy kit for a deployment: not the command, not `.ensemble/config.yaml`, and the command has no default of its own. */
export class NoDeployKitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoDeployKitError";
  }
}

/**
 * Which deploy kit a deployment goes through: the one the command names,
 * else the project's own choice for it (`deploy.<name>.kit` in
 * `.ensemble/config.yaml` — for a workload only one kit can deploy, like a
 * serverless stack only `aws` has provisioners for), else the command's
 * own default (`ens develop`'s compose), if it has one.
 */
export class DeployKitChoice {
  constructor(private readonly repoRoot: string) {}

  async for(
    name: string,
    requested: string | undefined,
    fallback?: string,
  ): Promise<string> {
    if (requested) return requested;
    const config = await new EnsembleConfigStore(this.repoRoot).loadOrEmpty();
    const configured = config.deploy?.[name]?.kit;
    if (configured) return configured;
    if (fallback) return fallback;
    throw new NoDeployKitError(
      `No deploy kit for "${name}": name one (\`ens deploy ${name} <kit>\`), or set "deploy.${name}.kit" in .ensemble/config.yaml.`,
    );
  }
}
