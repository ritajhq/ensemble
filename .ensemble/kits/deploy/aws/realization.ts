import * as KitSdk from "@ensemble/kit-sdk";

type Category = KitSdk.Deploy.Category;
type ClassPreset = KitSdk.Deploy.ClassPreset;
type Bound = KitSdk.Deploy.Bound;
type Knowability = KitSdk.Deploy.Knowability;

/** RDS's own real hard limit on backup retention (days) — the bound Appendix A's "BackupRetentionPeriod: 35 # class: critical, within bound" comment refers to. */
const MAX_BACKUP_RETENTION_DAYS = 35;

const RELATIONAL_CLASS_PRESETS: Readonly<Record<string, ClassPreset>> = {
  ephemeral: {
    concernValues: {
      storageSize: 20,
      backupRetention: 0,
      multiAz: false,
      deletionProtection: false,
    },
  },
  standard: {
    concernValues: {
      storageSize: 50,
      backupRetention: 7,
      multiAz: false,
      deletionProtection: false,
    },
  },
  critical: {
    concernValues: {
      storageSize: 100,
      backupRetention: 35,
      multiAz: true,
      deletionProtection: true,
    },
  },
};

const RELATIONAL_BOUNDS: Readonly<Record<string, Bound>> = {
  backupRetention: { max: MAX_BACKUP_RETENTION_DAYS },
};

const RELATIONAL_DYNAMIC_OUTPUTS: readonly string[] = ["host", "url"];

/**
 * The aws kit's realization: `relational` presets expand `class` into real
 * RDS properties (unlike compose, where `multiAz`/`deletionProtection` had
 * nothing to render into). `host` and `url` are `dynamic` — an RDS endpoint
 * is provider-allocated, never known at plan time (G3); `port`/`user`/
 * `database` stay `static` (5432 is a fixed convention, the rest are
 * passthrough params). Unlike compose, aws genuinely supports read replicas,
 * so that capability is declared satisfied.
 */
// deno-lint-ignore require-await
export async function awsRealization(): Promise<KitSdk.Deploy.Realization> {
  return {
    // deno-lint-ignore require-await
    async classPreset(
      category: Category,
      type: string,
      className: string,
    ): Promise<ClassPreset | undefined> {
      if (category === "databases" && type === "relational") {
        return RELATIONAL_CLASS_PRESETS[className];
      }
      return undefined;
    },
    // deno-lint-ignore require-await
    async defaultFor(): Promise<number | boolean | string | undefined> {
      return undefined;
    },
    // deno-lint-ignore require-await
    async boundFor(
      category: Category,
      type: string,
      concern: string,
    ): Promise<Bound | undefined> {
      if (category === "databases" && type === "relational") {
        return RELATIONAL_BOUNDS[concern];
      }
      return undefined;
    },
    // deno-lint-ignore require-await
    async supportsCapability(
      category: Category,
      type: string,
      capability: string,
    ): Promise<boolean> {
      return category === "databases" && type === "relational" &&
        capability === "read-replicas";
    },
    // deno-lint-ignore require-await
    async knowabilityOf(
      category: Category,
      type: string,
      output: string,
    ): Promise<Knowability> {
      if (
        category === "databases" && type === "relational" &&
        RELATIONAL_DYNAMIC_OUTPUTS.includes(output)
      ) {
        return "dynamic";
      }
      return "static";
    },
  };
}
