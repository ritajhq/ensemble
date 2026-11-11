import type { DeploymentScope } from "./deployment-scope.ts";

/** How a running service is doing, as its target reports it. */
export interface LiveService {
  readonly name: string;
  /** `running`, `exited`, `restarting`… as the target words it. */
  readonly state: string;
  /** Its health check's verdict, when it has one. */
  readonly health?: string;
  readonly image: string;
}

/**
 * A deployment found running on the machine, whoever deployed it: where it
 * came from, its services, and the hosts it answers on. Found, not stored:
 * what is running is the truth of it.
 */
export class LiveDeployment {
  constructor(
    /** What the target knows it by: the compose project's name. */
    readonly name: string,
    readonly scope: DeploymentScope,
    readonly services: readonly LiveService[],
    /** The hosts it asks the local proxy to answer for it. */
    readonly hosts: readonly string[],
    /** The platform's project it was deployed from; none when someone else deployed it. */
    readonly project?: string,
  ) {}
}
