import type { Gateway } from "./plan.ts";

/**
 * The `Routes:` listing `ens develop` shows: each gateway route's target,
 * the URL its gateway answers at, and its paths — as the compose and aws
 * kits list theirs.
 */
export function routeLines(
  gateways: readonly { gateway: Gateway; url: string }[],
): string[] {
  const rows = gateways.flatMap(({ gateway, url }) => {
    const targets = new Map<string, string[]>();
    for (const route of gateway.routes) {
      const name = "service" in route.target
        ? route.target.service
        : route.target.storage;
      targets.set(name, [...(targets.get(name) ?? []), route.path]);
    }
    return [...targets].map(([target, paths]) => ({
      target,
      url,
      paths: paths.join(" "),
    }));
  });
  if (rows.length === 0) return [];
  const targetWidth = Math.max(...rows.map((row) => row.target.length));
  const urlWidth = Math.max(...rows.map((row) => row.url.length));
  return [
    "Routes:",
    ...rows.map((row) =>
      `  ${row.target.padEnd(targetWidth)}  ${
        row.url.padEnd(urlWidth)
      }  ${row.paths}`
    ),
  ];
}

/** Where wrangler says a Worker it deployed answers on workers.dev, if it does. */
export function workersDevUrl(report: string): string | undefined {
  return /https:\/\/[a-z0-9.-]+\.workers\.dev/i.exec(report)?.[0];
}
