import * as KitSdk from "@ensemble/kit-sdk";
import { publishLibrary, stampLibrary } from "./publish-library.ts";

await KitSdk.Lib.run({ stamp: stampLibrary, publish: publishLibrary });
