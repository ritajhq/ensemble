const root = new URL("../", import.meta.url).pathname;

const add = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", "npm:shadcn@latest", "add", ...Deno.args],
  cwd: root,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
const { code } = await add.output();
if (code !== 0) Deno.exit(code);

const sync = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", "scripts/sync-exports.ts"],
  cwd: root,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
Deno.exit((await sync.output()).code);
