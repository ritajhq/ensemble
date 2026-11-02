import { assertEquals, assertRejects } from "@std/assert";
import type { Link, Package } from "./ecosystem/index.ts";
import type { CoreLibRelease } from "./lib-release-cascade.ts";
import { PublishOrder } from "./lib-publish-order.ts";

function libs(...names: string[]): CoreLibRelease[] {
  return names.map((name) => ({
    libRoot: `/${name}`,
    declaration: { package: name, publish: [] },
  }));
}

function orderWith(links: Record<string, readonly Link[]>): PublishOrder {
  return new PublishOrder({
    packageAt: (directory: string): Promise<Package | undefined> => {
      const name = directory.slice(1);
      return Promise.resolve({
        name,
        directory,
        links: links[name] ?? [],
      });
    },
  });
}

const link = (target: string): Link => ({ specifier: target, target });

async function names(
  order: PublishOrder,
  released: CoreLibRelease[],
): Promise<string[]> {
  const ordered = await order.of(released);
  return ordered.map(({ declaration }) => declaration.package);
}

Deno.test("PublishOrder: a library comes after everything it links to, however deep", async () => {
  const order = orderWith({ app: [link("mid")], mid: [link("base")] });
  assertEquals(
    await names(order, libs("app", "mid", "base")),
    ["base", "mid", "app"],
  );
});

Deno.test("PublishOrder: unrelated libraries keep the order they're listed in", async () => {
  assertEquals(
    await names(orderWith({}), libs("c", "a", "b")),
    ["c", "a", "b"],
  );
});

Deno.test("PublishOrder: a link to something outside the release doesn't hold anything up", async () => {
  assertEquals(
    await names(orderWith({ a: [link("elsewhere")] }), libs("a")),
    ["a"],
  );
});

Deno.test("PublishOrder: a link only tests need doesn't order anything, so it can't form a cycle", async () => {
  const order = orderWith({
    a: [link("b")],
    b: [{ ...link("a"), devOnly: true }],
  });
  assertEquals(await names(order, libs("a", "b")), ["b", "a"]);
});

Deno.test("PublishOrder: a cycle is refused, naming only the libraries in it", async () => {
  const order = orderWith({
    top: [link("a")],
    a: [link("b")],
    b: [link("a")],
  });
  await assertRejects(
    () => order.of(libs("top", "a", "b")),
    Error,
    "a -> b -> a",
  );
});

Deno.test("PublishOrder: a directory with no package falls back on its declared name", async () => {
  const order = new PublishOrder({
    packageAt: () => Promise.resolve(undefined),
  });
  assertEquals(await names(order, libs("a", "b")), ["a", "b"]);
});
