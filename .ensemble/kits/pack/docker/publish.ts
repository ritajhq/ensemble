import * as KitSdk from "@ensemble/kit-sdk";
import { $ } from "@david/dax";

const ctx = KitSdk.Pack.getPublishContext();

// Publish options come from the release's `publish:` block (every property
// other than target/name) — this kit reads `registry`.
const registry = ctx.options.registry;
if (!registry) {
  throw new Error(
    `docker kit's publish requires a "registry" option (the release's publish: block must set registry: <host>/<path>).`,
  );
}

// Credentials come from the process environment (see @ensemble/core's
// PUBLISH_ENV_PATH — .ensemble/publish.env), not from argv. Log in only when
// both are present; otherwise assume the daemon is already authenticated
// (e.g. a prior `docker login`).
const username = Deno.env.get("REGISTRY_USERNAME");
const password = Deno.env.get("REGISTRY_PASSWORD");
if (username && password) {
  const login = await $`docker login ${registry} -u ${username} --password-stdin`
    .stdinText(password)
    .noThrow();
  if (login.code !== 0) Deno.exit(login.code);
}

// The remote image is named by packageName (from the release's `publish.name`);
// the version is folded in as a tag alongside :latest.
const localTag = `${ctx.outputName}:latest`;
const remoteTags = [
  `${registry}/${ctx.packageName}:latest`,
  `${registry}/${ctx.packageName}:${ctx.version}`,
];

for (const tag of remoteTags) {
  const result = await $`docker image tag ${localTag} ${tag}`.noThrow();
  if (result.code !== 0) Deno.exit(result.code);
}

for (const tag of remoteTags) {
  const result = await $`docker push ${tag}`.noThrow();
  if (result.code !== 0) Deno.exit(result.code);
}
