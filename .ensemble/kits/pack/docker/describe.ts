import * as KitSdk from "@ensemble/kit-sdk";
import { locate } from "./locator.ts";

// Read-only: reports the reference this kit's publish.ts would (or already
// did) produce for the given deploy mode, without building or publishing
// anything. Deploy calls this instead of guessing the tag format itself.
const ctx = KitSdk.Pack.getDescribeContext();

console.log(locate(ctx.outputName, ctx.packageName, ctx.version, ctx.mode));
