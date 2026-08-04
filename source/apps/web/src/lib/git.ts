/**
 * Derives a project name from a git URL's last path segment (e.g.
 * "https://github.com/acme/widgets.git" -> "widgets"). Mirrors
 * source/core/core/git-integration.ts's deriveProjectName exactly, so the
 * prefilled project name matches what the server would default to.
 */
export function deriveProjectName(repoUrl: string): string {
  const trimmed = repoUrl.trim().replace(/\/+$/, "").replace(/\.git$/, "");
  const lastSegment = trimmed.split(/[/:]/).pop() ?? "";
  return lastSegment;
}
