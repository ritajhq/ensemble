import { Command, EnumType, ValidationError } from "@cliffy/command";
import { runBuild } from "@ensemble/core";

function parseVarOverrides(pairs: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex === -1) {
      throw new ValidationError(`Invalid --var "${pair}", expected KEY=VALUE.`);
    }
    result[pair.slice(0, separatorIndex)] = pair.slice(separatorIndex + 1);
  }
  return result;
}

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
      varOverrides: parseVarOverrides(vars ?? []),
    });
    if (code !== 0) Deno.exit(code);
  });
