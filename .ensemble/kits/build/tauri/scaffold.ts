import * as KitSdk from "@ensemble/kit-sdk";
import { ShellTemplate } from "./shell-template.ts";

const ctx = KitSdk.Scaffold.getContext();
await new ShellTemplate(ctx.dest, ctx.name).write();
console.log(`scaffolded ${ctx.name}`);
