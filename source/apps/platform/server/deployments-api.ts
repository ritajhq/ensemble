import type { Endpoints } from "./endpoints.ts";
import type { LiveDeployments } from "./live-deployments.ts";

/** The deployments part of the platform's API: what is running on the machine, whoever deployed it. */
export class DeploymentsApi {
  constructor(
    private readonly live: LiveDeployments,
    endpoints: Endpoints,
  ) {
    endpoints.add("GET", "/api/deployments", () => this.list());
  }

  private async list(): Promise<Response> {
    return Response.json(await this.live.list());
  }
}
