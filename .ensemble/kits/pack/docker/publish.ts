import * as KitSdk from "@ensemble/kit-sdk";
import { $ } from "@david/dax";

const ctx = KitSdk.Pack.getPublishContext();

// packageName is the FULL published image reference, straight from the
// release's `publish.name` (e.g. "registry.example.com/team/app") — the deploy
// side resolves a production compute's image to this same name, so publisher
// and consumer agree by construction. This kit invents no registry prefix; the
// author wires the whole reference. The version is folded in as a tag alongside
// :latest.
const localTag = `${ctx.outputName}:latest`;
const remoteTags = [
  `${ctx.packageName}:latest`,
  `${ctx.packageName}:${ctx.version}`,
];

// Registry auth is the caller's responsibility (a prior `docker login`, or an
// ambient/credential-helper-authenticated daemon) — consistent with the
// explicit-wiring principle. This kit does not log in.
for (const tag of remoteTags) {
  const result = await $`docker image tag ${localTag} ${tag}`.noThrow();
  if (result.code !== 0) Deno.exit(result.code);
}

for (const tag of remoteTags) {
  const result = await $`docker push ${tag}`.noThrow();
  if (result.code !== 0) Deno.exit(result.code);
}
