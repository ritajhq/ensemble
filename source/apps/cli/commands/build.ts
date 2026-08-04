import { Command, EnumType } from "@cliffy/command";
import { runBuild } from "@ensemble/core";
import * as CliUtil from "./util.ts";

export const buildCommand = new Command()
  .name("build")
  .description("Build an app using its configured kit.")
  .type("mode", new EnumType(["development", "production"]))
  .arguments("<name:string>")
  .option("-m, --mode <mode:mode>", "Build mode.", { default: "development" as const })
  .option("-w, --watch", "Rebuild on source changes.")
  .option("-e, --var <var:string>", "Override a build var (KEY=VALUE). Repeatable.", {
    collect: true,
  })
  .action(async ({ mode, watch, var: vars }, name) => {
    const code = await runBuild(name, {
      mode,
      watch: Boolean(watch),
      varOverrides: CliUtil.parseVarOverrides(vars ?? []),
    });
    if (code !== 0) Deno.exit(code);
  });
