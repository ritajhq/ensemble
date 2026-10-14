import { assertEquals } from "@std/assert";
import * as Platform from "@ensemble/platform";
import { Checkouts } from "./checkouts.ts";
import { Process } from "./process.ts";

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
  const checkouts = new Checkouts(await workspace());
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
