import * as KitSdk from "@ensemble/kit-sdk";
import { $ } from "@david/dax";
import { locate } from "./locator.ts";

// Read-only: checks whether this release's reference is actually reachable
// — a local image in development mode, a pullable registry reference in
// production — without pulling the image itself. Section 5b's apply-time
// preflight; never run for eject/plan.
const ctx = KitSdk.Pack.getDescribeContext();
const ref = locate(ctx.outputName, ctx.packageName, ctx.version, ctx.mode);

// `imagetools inspect` (not `docker manifest inspect`) for the registry case:
// buildx's own default output is an OCI image index, and `docker manifest
// inspect` doesn't reliably fetch those from a real registry — `imagetools`
// is buildx's own client and handles both index and plain-manifest images.
const inspect = ctx.mode === "development"
  ? $`docker image inspect ${ref}`
  : $`docker buildx imagetools inspect ${ref}`;

const result = await inspect.stdout("piped").stderr("piped").noThrow();
if (result.code === 0) {
  Deno.exit(0);
}

console.error(result.stderr.trim() || `"${ref}" not found`);
Deno.exit(1);
