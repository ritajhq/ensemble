import * as KitSdk from "@ensemble/kit-sdk";
import { $ } from "@david/dax";

const ctx = KitSdk.Pack.getPublishContext();

// `options` is a comma-separated key=value string, the same raw convention
// `modes` values already use in this kit's own main.ts.
const options = Object.fromEntries(
  ctx.options.split(",").filter(Boolean).map((pair) => {
    const [key, value] = pair.split("=");
    return [key, value];
  }),
);

const registry = options.registry;
if (!registry) {
  throw new Error(
    `docker kit's publish options must include "registry=<host>/<path>", got "${ctx.options}".`,
  );
}

const localTag = `${ctx.outputName}:latest`;
const remoteTags = [
  `${registry}/${ctx.outputName}:latest`,
  `${registry}/${ctx.outputName}:${ctx.version}`,
];

for (const tag of remoteTags) {
  const result = await $`docker image tag ${localTag} ${tag}`.noThrow();
  if (result.code !== 0) Deno.exit(result.code);
}

for (const tag of remoteTags) {
  const result = await $`docker push ${tag}`.noThrow();
  if (result.code !== 0) Deno.exit(result.code);
}
