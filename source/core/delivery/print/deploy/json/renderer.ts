import type { Architecture } from "../architecture.ts";
import type { Renderer as DeployRenderer, Rendering } from "../renderer.ts";

/** The architecture as JSON: what any other renderer, or a program, reads from. */
export class Renderer implements DeployRenderer {
  render(_name: string, architecture: Architecture): Promise<Rendering> {
    return Promise.resolve({
      stdout: JSON.stringify(architecture, null, 2),
      written: [],
      warnings: [],
    });
  }
}
