import * as KitSdk from "@ensemble/kit-sdk";

type Category = KitSdk.Deploy.Category;
type ClassPreset = KitSdk.Deploy.ClassPreset;
type Bound = KitSdk.Deploy.Bound;
type Knowability = KitSdk.Deploy.Knowability;

const RELATIONAL_CLASS_PRESETS: Readonly<Record<string, ClassPreset>> = {
  ephemeral: {
    concernValues: {
      backupRetention: 0,
      multiAz: false,
      deletionProtection: false,
    },
  },
  standard: {
    concernValues: {
      backupRetention: 7,
      multiAz: false,
      deletionProtection: false,
    },
  },
  // "critical" → persistent volume + restart: always (no multi-AZ concept locally) — see
  // provisioners/relational.ts, which reads `request.class` directly for that structural
  // decision rather than through these concern values (Section 6 vs. Appendix A: multiAz/
  // deletionProtection are still resolved, portable concerns — they just render to nothing
  // on this target, unlike on aws where they become real RDS properties).
  critical: {
    concernValues: {
      backupRetention: 35,
      multiAz: true,
      deletionProtection: true,
    },
  },
};

/**
 * The compose kit's realization: no bounds (nothing about a local Docker
 * Compose stack needs a platform cap), no capabilities satisfied yet (no
 * manifest in this repo's fixtures asks for one on compose), and every
 * `relational` output is `static` — Appendix A's whole point is that
 * `primary.host` is knowable at plan time because it's just the compose
 * service name, never a provider-allocated value (G3).
 */
// deno-lint-ignore require-await
export async function composeRealization(): Promise<KitSdk.Deploy.Realization> {
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
    async boundFor(): Promise<Bound | undefined> {
      return undefined;
    },
    // deno-lint-ignore require-await
    async supportsCapability(): Promise<boolean> {
      return false;
    },
    // deno-lint-ignore require-await
    async knowabilityOf(): Promise<Knowability> {
      return "static";
    },
  };
}
