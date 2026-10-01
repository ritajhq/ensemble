import * as KitSdk from "@ensemble/kit-sdk";

// A VS Code extension ship packs the app of the same name (ship
// extension/vscode -> app extension/vscode), so that's its only dependency.
const ctx = KitSdk.Pack.getDependenciesContext();

const dependencies = ctx.apps.filter((app) => ctx.ship.endsWith(`/ship/${app}`));

console.log(
  JSON.stringify({ artifacts: dependencies } satisfies KitSdk.Pack.Result),
);
