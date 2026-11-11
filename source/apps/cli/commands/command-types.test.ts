import { assertEquals, assertRejects } from "@std/assert";
import { Command, EnumType } from "@cliffy/command";
import { Vendor } from "@ensemble/core";
import { appCommand } from "./app.ts";
import { buildCommand } from "./build.ts";
import { configCommand } from "./config.ts";
import { deliveryCommand } from "./delivery.ts";
import { operationsCommand } from "./operations.ts";
import { deployCommand } from "./deploy.ts";
import { destroyCommand } from "./destroy.ts";
import { developCommand } from "./develop.ts";
import { execCommand, syncCommand } from "./exec.ts";
import { initCommand } from "./init.ts";
import { kitCommand } from "./kit.ts";
import { libCommand } from "./lib.ts";
import { lspCommand } from "./lsp.ts";
import { mcpCommand } from "./mcp.ts";
import { packCommand } from "./pack.ts";
import { publishCommand } from "./publish.ts";
import { releaseCommand } from "./release.ts";
import { statusCommand } from "./status.ts";
import { versionCommand } from "./version.ts";

// deno-lint-ignore no-explicit-any
type AnyCommand = Command<any, any, any, any, any, any, any, any>;

/** Cliffy registers these on every command as it parses, so they aren't visible to a lookup before that. */
const BUILT_IN_TYPES = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "file",
  "secret",
]);

const TOP_LEVEL_COMMANDS: readonly AnyCommand[] = [
  initCommand,
  syncCommand,
  execCommand,
  appCommand,
  kitCommand,
  libCommand,
  buildCommand,
  packCommand,
  publishCommand,
  deployCommand,
  destroyCommand,
  developCommand,
  deliveryCommand,
  operationsCommand,
  configCommand,
  releaseCommand,
  statusCommand,
  mcpCommand,
  lspCommand,
  versionCommand,
];

/** Every type a command's arguments and options name that it can't resolve itself or through a parent's global types. */
function unknownTypes(command: AnyCommand): string[] {
  const named = [
    ...(command.getArguments()),
    ...command.getOptions(true).flatMap((option) => option.args ?? []),
  ].map((argument) => argument.type);
  const unknown = named
    .filter((type) => !BUILT_IN_TYPES.has(type) && !command.getType(type))
    .map((type) => `${command.getPath()}: ${type}`);
  const subcommands = command.getCommands(true) as AnyCommand[];
  return [...unknown, ...subcommands.flatMap(unknownTypes)];
}

Deno.test("every command resolves the types its arguments and options name", () => {
  assertEquals(TOP_LEVEL_COMMANDS.flatMap(unknownTypes), []);
});

Deno.test("kit new: takes every role a kit can have", () => {
  const types = kitCommand.getCommand("new")?.getType("role");
  const values = types?.handler instanceof EnumType
    ? types.handler.values()
    : [];
  assertEquals(values, [...Vendor.KitManifest.ROLES]);
  assertEquals(values.includes("ecosystem"), true);
});

// A value outside the enum only fails this way once its type is found, and it fails before the action runs.
for (
  const [label, name, command, args, expected] of [
    ["kit new", "kit", kitCommand, ["new", "foo", "nope"], "role"],
    ["kit update", "kit", kitCommand, ["update", "foo", "nope"], "bump"],
    ["lib update", "lib", libCommand, ["update", "foo", "nope"], "bump"],
  ] as const
) {
  Deno.test(`${label}: checks its ${expected} argument against its values`, async () => {
    const cli = new Command().throwErrors().command(name, command).reset();
    await assertRejects(
      () => cli.parse([name, ...args]),
      Error,
      `Argument "${expected}" must be of type "${expected}", but got "nope"`,
    );
  });
}
