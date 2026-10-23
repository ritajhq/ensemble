import type { Architecture } from "./architecture.ts";

/** What rendering an architecture came to, for whoever asked to report it. */
export interface Rendering {
  /** What the renderer would have the caller print: the architecture itself, as text. */
  readonly stdout?: string;
  /** The files it wrote. */
  readonly written: readonly string[];
  /** Things it noticed that didn't stop it (a drawing that may not read as meant). */
  readonly warnings: readonly string[];
}

/**
 * Turns the architecture of the manifest named `name` into one output: text
 * to print, files, or both. Each renderer is told what to render and keeps
 * whatever else it needs (where to write, say) from its construction.
 */
export interface Renderer {
  render(name: string, architecture: Architecture): Promise<Rendering>;
}
