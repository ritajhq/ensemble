import type { Category } from "../workload.ts";
import type { Kit } from "../kit/kit.ts";
import type { Provisioner, ProvisionerSet } from "../kit/provisioner.ts";
import type {
  Bound,
  ClassPreset,
  Knowability,
  Realization,
} from "../kit/realization.ts";
import type { Target } from "../kit/target.ts";
import type { MatchedResource } from "./matched-resource.ts";

/** Test-only fakes for Phase 3's resolution agents — "everything tested with fakes, no kit, no I/O" (Section 13). Not part of the public barrel; imported directly by test files. */

export class FakeProvisioner implements Provisioner {
  readonly describe?: () => string;

  constructor(
    private readonly predicate: (resource: MatchedResource) => boolean,
    label?: string,
  ) {
    if (label !== undefined) this.describe = () => label;
  }
  matches(resource: MatchedResource): boolean {
    return this.predicate(resource);
  }
}

export class FakeRealization implements Realization {
  private readonly presets = new Map<string, ClassPreset>();
  private readonly defaults = new Map<string, number | boolean | string>();
  private readonly bounds = new Map<string, Bound>();
  private readonly capabilities = new Map<string, boolean>();
  private readonly knowability = new Map<string, Knowability>();

  withClassPreset(
    category: Category,
    type: string,
    className: string,
    preset: ClassPreset,
  ): this {
    this.presets.set(`${category}.${type}.${className}`, preset);
    return this;
  }

  withDefault(
    category: Category,
    type: string,
    concern: string,
    value: number | boolean | string,
  ): this {
    this.defaults.set(`${category}.${type}.${concern}`, value);
    return this;
  }

  withBound(
    category: Category,
    type: string,
    concern: string,
    bound: Bound,
  ): this {
    this.bounds.set(`${category}.${type}.${concern}`, bound);
    return this;
  }

  withCapability(
    category: Category,
    type: string,
    capability: string,
    supported: boolean,
  ): this {
    this.capabilities.set(`${category}.${type}.${capability}`, supported);
    return this;
  }

  classPreset(
    category: Category,
    type: string,
    className: string,
  ): ClassPreset | undefined {
    return this.presets.get(`${category}.${type}.${className}`);
  }

  defaultFor(
    category: Category,
    type: string,
    concern: string,
  ): number | boolean | string | undefined {
    return this.defaults.get(`${category}.${type}.${concern}`);
  }

  boundFor(
    category: Category,
    type: string,
    concern: string,
  ): Bound | undefined {
    return this.bounds.get(`${category}.${type}.${concern}`);
  }

  supportsCapability(
    category: Category,
    type: string,
    capability: string,
  ): boolean {
    return this.capabilities.get(`${category}.${type}.${capability}`) ?? false;
  }

  knowabilityOf(): Knowability {
    return "static";
  }
}

export class FakeKit implements Kit {
  constructor(
    private readonly set: ProvisionerSet,
    private readonly instance: Realization,
  ) {}
  provisioners(): ProvisionerSet {
    return this.set;
  }
  realization(): Realization {
    return this.instance;
  }
  present(): never {
    throw new Error(
      "FakeKit.present is not implemented — inject a real fake for tests that need it.",
    );
  }
  applyCommand(): never {
    throw new Error(
      "FakeKit.applyCommand is not implemented — inject a real fake for tests that need it.",
    );
  }
}

export function fakeTarget(kit: Kit): Target {
  return { kit };
}
