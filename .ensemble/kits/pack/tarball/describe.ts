import { join } from "@std/path";
import * as KitSdk from "@ensemble/kit-sdk";

const ctx = KitSdk.Pack.getDescribeContext();
const repoRoot = await KitSdk.findRepoRoot();
console.log(
  join(
    repoRoot,
    "source",
    "artifacts",
    "packages",
    `${ctx.outputName}.tar.gz`,
  ),
);
