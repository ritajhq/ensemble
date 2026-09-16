import * as KitSdk from "@ensemble/kit-sdk";
import { publishLibrary } from "./publish-library.ts";

await publishLibrary(KitSdk.Lib.getContext());
