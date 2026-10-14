import { $ } from "@david/dax";
import * as KitSdk from "@ensemble/kit-sdk";

// Creating a GitHub release or uploading to one takes write access to the
// repository, so that's what's checked: the permission gh's authenticated
// account (or GH_TOKEN) holds on the same repo publish.ts would target —
// options.repo when set, otherwise the one gh infers from the git remote.
const WRITE_PERMISSIONS = ["ADMIN", "MAINTAIN", "WRITE"];

await KitSdk.Pack.authorizePublish(async (ctx) => {
  const ghCheck = await $`gh --version`.quiet().noThrow();
  if (ghCheck.code !== 0) {
    throw new Error(
      "gh (the GitHub CLI) is required to publish to a GitHub release but isn't on PATH — install it from https://cli.github.com first.",
    );
  }

  const repoArgs = ctx.options.repo ? [ctx.options.repo] : [];
  const view =
    await $`gh repo view ${repoArgs} --json nameWithOwner,viewerPermission`
      .stdout("piped")
      .stderr("piped")
      .noThrow();
  if (view.code !== 0) {
    throw new Error(
      `gh couldn't read the repository's permissions — ${
        view.stderr.trim() || `exit code ${view.code}`
      }`,
    );
  }

  const { nameWithOwner, viewerPermission } = JSON.parse(view.stdout) as {
    nameWithOwner: string;
    viewerPermission: string | null;
  };
  if (WRITE_PERMISSIONS.includes(viewerPermission ?? "")) return;
  throw new Error(
    `the GitHub account gh is using has ${
      viewerPermission ?? "no"
    } access to ${nameWithOwner}; publishing a release needs write access.`,
  );
});
