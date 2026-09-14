import type { MatchedResource } from "../resolve/matched-resource.ts";
import type { Provisioner } from "./provisioner.ts";
import type { ProvisionerConfigEntry } from "./config.ts";

/**
 * A project-declared provisioner (Section 10's extension ladder, rungs 2–3):
 * matches on `type` plus whichever of `class`/`capabilities`/`category` the
 * config entry declares — an omitted criterion matches anything. Actually
 * fulfilling the resource (`provision()`) isn't built yet — that needs
 * Phase 5's `ResolvedRequest`/`ProvisionOutcome`, so for now this only
 * satisfies `ProvisionerSelector`'s `matches()` need.
 */
export class ConfiguredProvisioner implements Provisioner {
  constructor(private readonly entry: ProvisionerConfigEntry) {}

  describe(): string {
    const implementation = this.entry.implementation.kind;
    return `${
      this.entry.id ?? this.entry.type
    } (project-declared, ${implementation})`;
  }

  matches(resource: MatchedResource): boolean {
    if (resource.declaration.type !== this.entry.type) return false;
    if (
      this.entry.category !== undefined &&
      resource.category !== this.entry.category
    ) return false;
    if (
      this.entry.class !== undefined &&
      resource.declaration.class !== this.entry.class
    ) return false;
    if (
      this.entry.capabilities !== undefined &&
      !this.hasAllCapabilities(resource)
    ) return false;
    return true;
  }

  private hasAllCapabilities(resource: MatchedResource): boolean {
    const declared = resource.declaration.capabilities ?? {};
    return this.entry.capabilities!.every((capability) =>
      capability in declared
    );
  }
}
