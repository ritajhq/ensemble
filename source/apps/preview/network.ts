import { Process } from "./process.ts";

/** The Docker network the router and every preview's gateway share. */
export class Network {
  constructor(private readonly name: string) {}

  /** Creates the network if the host doesn't have it yet, so a deploy never depends on the router having been brought up first. */
  async ensure(): Promise<void> {
    const exists = await new Process("docker", [
      "network",
      "inspect",
      this.name,
    ])
      .run().then(() => true, () => false);
    if (exists) return;
    await new Process("docker", ["network", "create", this.name]).run();
  }
}
