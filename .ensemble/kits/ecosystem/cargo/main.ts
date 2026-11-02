import * as KitSdk from "@ensemble/kit-sdk";
import { Workspace } from "./workspace.ts";

await KitSdk.Ecosystem.run({
  initialize: (repoRoot) => new Workspace(repoRoot).initialize(),
  packageAt: (repoRoot, directory) =>
    new Workspace(repoRoot).packageAt(directory),
  stamp: (repoRoot, version, targets) =>
    new Workspace(repoRoot).stamp(version, targets),
  scaffoldLibrary: (repoRoot, directory, name) =>
    new Workspace(repoRoot).scaffoldLibrary(directory, name),
  lockfiles: (repoRoot) => new Workspace(repoRoot).lockfiles(),
});
