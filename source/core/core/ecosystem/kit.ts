import { KitProcess } from "../kit-process.ts";
import type { Ports } from "../ports.ts";
import type {
  Ecosystem,
  Invocation,
  Package,
  StampTarget,
} from "./ecosystem.ts";

/** An ecosystem served by a kit in `.ensemble/kits/ecosystem/<name>`, speaking the contract `KitSdk.Ecosystem.run` implements. */
export class Kit implements Ecosystem {
  private readonly process: KitProcess;

  constructor(
    private readonly repoRoot: string,
    directory: string,
    ports: Pick<Ports, "denoExe" | "process">,
  ) {
    this.process = new KitProcess(directory, ports);
  }

  async initialize(): Promise<void> {
    await this.ask("initialize", {});
  }

  async sync(): Promise<void> {
    await this.ask("sync", {});
  }

  packageAt(directory: string): Promise<Package | undefined> {
    return this.ask("packageAt", { directory });
  }

  stamp(version: string, targets: readonly StampTarget[]): Promise<string[]> {
    return this.ask("stamp", { version, targets });
  }

  async scaffoldLibrary(directory: string, name: string): Promise<void> {
    await this.ask("scaffoldLibrary", { directory, name });
  }

  lockfiles(): Promise<string[]> {
    return this.ask("lockfiles", {});
  }

  invocation(
    tool: string,
    args: readonly string[],
  ): Promise<Invocation | undefined> {
    return this.ask("invocation", { tool, args });
  }

  /** The kit's answer is the last line it prints, so a tool it runs may print before it. */
  private async ask<Answer>(
    operation: string,
    request: object,
  ): Promise<Answer> {
    const printed = await this.process.capture("main.ts", [
      operation,
      "--repo-root",
      this.repoRoot,
      "--request",
      JSON.stringify(request),
    ]);
    return JSON.parse(printed.split("\n").at(-1)!).result;
  }
}
