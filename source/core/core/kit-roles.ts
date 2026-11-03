/** Every known kit role, one `.ensemble/kits/<role>` directory each. */
export const ROLES = ["build", "pack", "deploy", "lib", "ecosystem"] as const;

export type Role = typeof ROLES[number];
