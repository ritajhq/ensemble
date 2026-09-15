import { join } from "@std/path";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Which of `apps` this ship's Dockerfile actually references via `COPY
 * --from=<app>` — the single source of truth `main.ts` (deciding which
 * build-context args to pass buildx) and `dependencies.ts` (answering the
 * identical question before any build has run) both call, so the two can
 * never drift apart.
 */
export async function referencedApps(
  ship: string,
  apps: readonly string[],
): Promise<string[]> {
  const dockerfileText = await Deno.readTextFile(join(ship, "Dockerfile"));
  return apps.filter((app) => {
    const fromPattern = new RegExp(`--from=${escapeRegExp(app)}(?=\\s)`);
    return fromPattern.test(dockerfileText);
  });
}
