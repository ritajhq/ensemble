/** Waits for a TCP port on this machine to accept connections. */
export class Readiness {
  constructor(
    private readonly timeoutMs = 60_000,
    private readonly intervalMs = 100,
  ) {}

  /** Resolves true when `port` accepts a connection, false if `stillRunning` turns false or the time runs out. */
  async ofPort(port: number, stillRunning: () => boolean): Promise<boolean> {
    const deadline = Date.now() + this.timeoutMs;
    while (stillRunning() && Date.now() < deadline) {
      if (await this.accepts(port)) return true;
      await new Promise((resolve) => setTimeout(resolve, this.intervalMs));
    }
    return false;
  }

  private async accepts(port: number): Promise<boolean> {
    try {
      const connection = await Deno.connect({ hostname: "127.0.0.1", port });
      connection.close();
      return true;
    } catch {
      return false;
    }
  }
}
