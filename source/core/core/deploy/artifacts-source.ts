/**
 * Which locator `ReleaseLocatorResolver` composes for a `${release.<name>}`
 * reference — `local` for the tag `ens pack`/`ens develop` would have
 * produced locally, `published` for the remote reference a release was
 * actually published under. Orthogonal to `--watch`: an invocation may
 * combine either value with watching or not.
 */
export type ArtifactsSource = "local" | "published";
