/**
 * One `deploy.external` entry a kit knows how to stand up locally in place of
 * assuming it already exists elsewhere (`--emulate-externals`) — a compose
 * external network via `docker network create`, say. `check` is run first and
 * silently; exiting zero means the resource is already there and `create` is
 * skipped, which is what makes a repeated `ens develop` idempotent rather
 * than failing on "already exists". `name` (the manifest's `external.<name>`)
 * is only for error messages — neither command receives it implicitly.
 */
export interface ExternalEmulation {
  readonly name: string;
  readonly check: readonly string[];
  readonly create: readonly string[];
}
