import * as KitSdk from "@ensemble/kit-sdk";

interface CloudFormationFragmentContent {
  readonly resources: Readonly<Record<string, unknown>>;
  readonly parameters?: Readonly<Record<string, unknown>>;
}

/**
 * Assembles a render pass's `Artifacts` into one CloudFormation template.
 * Unlike compose, this needs no `DependencyGraph` at all: CloudFormation
 * orders its own apply from the `!Ref`/`!GetAtt` intrinsics already embedded
 * in each resource's properties (Section 8 — "depends on the kit" whether
 * ordering is ens's job or the target's; here it's the target's).
 * `Parameters:` is omitted entirely when nothing declared one, matching
 * `services:`/`volumes:`'s own "declared-if-present" shape.
 */
export function assembleCloudFormationDocument(
  artifacts: KitSdk.Deploy.Render.Artifacts,
): Record<string, unknown> {
  const resources: Record<string, unknown> = {};
  const parameters: Record<string, unknown> = {};

  for (const fragment of artifacts.fragments) {
    const content = fragment.content as CloudFormationFragmentContent;
    Object.assign(resources, content.resources);
    Object.assign(parameters, content.parameters ?? {});
  }

  const document: Record<string, unknown> = {};
  if (Object.keys(parameters).length > 0) document.Parameters = parameters;
  document.Resources = resources;
  return document;
}
