import { assertEquals, assertRejects } from "@std/assert";
import { type Actions, run } from "./ecosystem-context.ts";

const ACTIONS: Actions = {
  initialize: () => Promise.resolve(),
  sync: () => Promise.resolve(),
  invocation: () => Promise.resolve(undefined),
  packageAt: (_repoRoot, directory) =>
    Promise.resolve({ directory, links: [] }),
  stamp: (repoRoot, version, targets) =>
    Promise.resolve([`${repoRoot} ${version} ${targets[0].name}`]),
  scaffoldLibrary: () => Promise.resolve(),
  lockfiles: () => Promise.resolve([]),
};

async function printedBy(args: string[]): Promise<string[]> {
  const printed: string[] = [];
  const log = console.log;
  console.log = (line: string) => printed.push(line);
  try {
    await run(ACTIONS, args);
  } finally {
    console.log = log;
  }
  return printed;
}

Deno.test("Ecosystem.run: prints the operation's result as JSON", async () => {
  const printed = await printedBy([
    "stamp",
    "--repo-root",
    "/repo",
    "--request",
    JSON.stringify({
      version: "1.2.3",
      targets: [{ name: "a", directory: "/a" }],
    }),
  ]);

  assertEquals(printed, [JSON.stringify({ result: ["/repo 1.2.3 a"] })]);
});

Deno.test("Ecosystem.run: an unknown operation is refused", async () => {
  await assertRejects(
    () => run(ACTIONS, ["nonsense", "--repo-root", "/r", "--request", "{}"]),
    Error,
    'Unknown ecosystem kit operation "nonsense"',
  );
});
