import type * as KitSdk from "@ensemble/kit-sdk";

/**
 * The single source of truth for this kit's image-reference format. Both
 * publish.ts (which must produce exactly this tag) and describe.ts (which
 * reports it to deploy, without publishing anything) call this, so the two
 * can never drift apart.
 */
export function locate(
  outputName: string,
  packageName: string,
  version: string,
  artifacts: KitSdk.Pack.ArtifactsSource,
): string {
  return artifacts === "local"
    ? `${outputName}:latest`
    : `${packageName}:${version}`;
}
