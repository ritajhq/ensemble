import { allFeatures, isFeatureEnabled } from "@ensemble/platform";

const enabled = allFeatures.filter((feature) => isFeatureEnabled(feature.name));
const disabled = allFeatures.filter((feature) => !isFeatureEnabled(feature.name));

for (const feature of enabled) {
  console.log(`mounted  ${feature.method} ${feature.path}  (${feature.name})`);
}
for (const feature of disabled) {
  console.log(`disabled ${feature.method} ${feature.path}  (${feature.name})`);
}

const port = Number(Deno.env.get("PORT") ?? "8787");

Deno.serve({ port }, (request) => {
  const url = new URL(request.url);
  const feature = enabled.find((f) => f.method === request.method && f.path === url.pathname);
  if (!feature) {
    return new Response("Not found", { status: 404 });
  }
  return feature.handle(request);
});
