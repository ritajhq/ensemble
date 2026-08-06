export function run(): Record<string, string> {
  return {
    allowed: Deno.env.get("ENSEMBLE_TEST_ALLOWED_SECRET") ?? "",
    forbidden: Deno.env.get("ENSEMBLE_TEST_FORBIDDEN_SECRET") ?? "",
  };
}
