/** Turns a structured var-override map back into repeatable `KEY=VALUE` CLI flags, for sessions spawned as a real subprocess instead of calling a run* function in-process. */
export class CliArgs {
  static VarFlags(flag: string, overrides?: Record<string, string>): string[] {
    if (!overrides) return [];
    return Object.entries(overrides).flatMap(([key, value]) => [flag, `${key}=${value}`]);
  }
}
