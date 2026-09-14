import type { Category } from "../workload.ts";
import type { ResolvedValue } from "./resolved-values.ts";

/**
 * Everything a `Provisioner` needs to fulfill a resource, minus reference
 * resolution — `params` still carries `${...}` placeholders untouched (Section
 * 8: the `Renderer` walks these in dependency order once artifacts are being
 * built, not before).
 */
export interface ProvisioningRequest {
  readonly category: Category;
  readonly name: string;
  readonly type: string;
  readonly class?: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly values: Readonly<Record<string, ResolvedValue>>;
}
