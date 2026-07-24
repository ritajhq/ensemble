import { allFeatures, isFeatureEnabled } from "@ensemble/platform";

const enabled = allFeatures.filter((feature) => isFeatureEnabled(feature.name));
const disabled = allFeatures.filter((feature) => !isFeatureEnabled(feature.name));

for (const feature of enabled) {
  console.log(`mounted  ${feature.method} ${feature.pattern.pathname}  (${feature.name})`);
}
for (const feature of disabled) {
  console.log(`disabled ${feature.method} ${feature.pattern.pathname}  (${feature.name})`);
}

const port = Number(Deno.env.get("PORT") ?? "8787");

Deno.serve({ port }, (request) => {
  for (const feature of enabled) {
    if (request.method !== feature.method) continue;
    const match = feature.pattern.exec(request.url);
    if (match) return feature.handle(request, match.pathname.groups);
  }
  return new Response("Not found", { status: 404 });
});
