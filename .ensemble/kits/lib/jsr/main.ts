import * as KitSdk from "@ensemble/kit-sdk";
import { authorizeLibrary } from "./authorize-library.ts";
import { publishLibrary, stampLibrary } from "./publish-library.ts";

await KitSdk.Lib.run({
  authorize: (context) => authorizeLibrary(context),
  stamp: stampLibrary,
  publish: publishLibrary,
});
