import { assertEquals, assertRejects } from "@std/assert";
import * as Platform from "@ensemble/platform";
import { Checkouts } from "./checkouts.ts";
import type * as Github from "./github/index.ts";
import { Process } from "./process.ts";

/** Tokens that hand out the same token for every repository. */
const tokens = {
  for: () => Promise.resolve("secret-token"),
} as unknown as Github.Tokens;

const project = Platform.Project.create({
  id: "portal",
  repository: "ritajhq/portal",
  ref: "main",
});

/** A workspace holding a one-commit repository as the project's checkout. */
async function workspace(): Promise<string> {
  const root = await Deno.makeTempDir();
  const path = `${root}/portal`;
  await Deno.mkdir(path);
  const git = (...args: string[]) =>
    new Process("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
      cwd: path,
    }).run();
  await git("init", "--quiet");
  await git("commit", "--quiet", "--allow-empty", "-m", "first");
  return root;
}

Deno.test("Checkouts: work on one project's checkout takes turns, even after one fails", async () => {
  const checkouts = new Checkouts(await workspace(), tokens);
  const order: string[] = [];
  const slow = Promise.withResolvers<void>();

  const first = checkouts.use(project, async () => {
    order.push("first starts");
    await slow.promise;
    order.push("first ends");
    throw new Error("first fails");
  }).catch(() => {});
  const second = checkouts.use(project, (checkout) => {
    order.push(`second at ${checkout.commit.length}-char commit`);
    return Promise.resolve();
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  assertEquals(order, ["first starts"]);
  slow.resolve();
  await Promise.all([first, second]);

  assertEquals(order, [
    "first starts",
    "first ends",
    "second at 40-char commit",
  ]);
});

Deno.test("Checkouts: a failing git never repeats the token it was given", async () => {
  const checkouts = new Checkouts(await Deno.makeTempDir(), tokens);
  const unreachable = Platform.Project.create({
    id: "nowhere",
    repository: "ritajhq/does-not-exist-anywhere",
    ref: "main",
  });
  const error = await assertRejects(() => checkouts.update(unreachable), Error);
  const credential = btoa("x-access-token:secret-token");
  assertEquals(error.message.includes(credential), false);
  assertEquals(error.message.includes("secret-token"), false);
  assertEquals(error.message.includes("••••"), true);
});

Deno.test("Checkouts: versions are the checkout's tags, the most recently made first", async () => {
  const root = await workspace();
  const tag = (name: string, date: string) =>
    new Process(
      "git",
      [
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@t",
        "tag",
        "-a",
        name,
        "-m",
        name,
      ],
      { cwd: `${root}/portal`, env: { GIT_COMMITTER_DATE: date } },
    ).run();
  await tag("1.0.10-alpha", "2026-08-20T00:00:00Z");
  await tag("0.50.0", "2026-10-13T00:00:00Z");

  assertEquals(await new Checkouts(root, tokens).versions(project), [
    "0.50.0",
    "1.0.10-alpha",
  ]);
  assertEquals(
    await new Checkouts(await Deno.makeTempDir(), tokens).versions(project),
    [],
  );
});
