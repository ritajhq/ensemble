import type { App, Kit, Library, Workload } from "./project.ts";

/**
 * Turns a project survey into some representation of it — text for a person,
 * JSON for a program. `Survey` calls each step exactly once, in declaration
 * order, with that section's entries already sorted; `build` then returns the
 * finished representation.
 */
export abstract class Builder<Output> {
  abstract apps(apps: readonly App[]): void;
  abstract kits(kits: readonly Kit[]): void;
  abstract libraries(libraries: readonly Library[]): void;
  abstract workloads(workloads: readonly Workload[]): void;
  abstract build(): Output;
}
