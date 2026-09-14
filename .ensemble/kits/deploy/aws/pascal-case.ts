/** CloudFormation logical IDs and parameter names must be alphanumeric — a resource name like "db-password" becomes "DbPassword", "primary" becomes "Primary". */
export function pascalCase(name: string): string {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join("");
}
