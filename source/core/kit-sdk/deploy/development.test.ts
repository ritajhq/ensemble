import { assertEquals, assertThrows } from "@std/assert";
import { DevelopmentBlockError, parseDevelopmentBlock } from "./development.ts";

Deno.test("parseDevelopmentBlock: a single sync rule with defaults", () => {
  const block = parseDevelopmentBlock({
    sync: [{ app: "website/server", path: "/app/server" }],
  });

  assertEquals(block, {
    sync: [{
      app: "website/server",
      path: "/app/server",
      action: "sync",
      ignore: [],
    }],
  });
});

Deno.test("parseDevelopmentBlock: an explicit sync+restart action and ignore globs", () => {
  const block = parseDevelopmentBlock({
    sync: [{
      app: "website/server",
      path: "/app/server",
      action: "sync+restart",
      ignore: ["*.test.ts", "node_modules"],
    }],
  });

  assertEquals(block.sync[0].action, "sync+restart");
  assertEquals(block.sync[0].ignore, ["*.test.ts", "node_modules"]);
});

Deno.test("parseDevelopmentBlock: multiple sync rules", () => {
  const block = parseDevelopmentBlock({
    sync: [
      { app: "website/server", path: "/app/server" },
      { app: "website/content", path: "/app/content" },
    ],
  });

  assertEquals(block.sync.length, 2);
});

Deno.test("parseDevelopmentBlock: throws when development itself isn't a mapping", () => {
  assertThrows(
    () => parseDevelopmentBlock("not-a-mapping"),
    DevelopmentBlockError,
    "development must be a mapping",
  );
});

Deno.test("parseDevelopmentBlock: throws on an unknown top-level key", () => {
  assertThrows(
    () => parseDevelopmentBlock({ sync: [], rebuild: true }),
    DevelopmentBlockError,
    'development has no key "rebuild"',
  );
});

Deno.test("parseDevelopmentBlock: throws when sync is missing", () => {
  assertThrows(
    () => parseDevelopmentBlock({}),
    DevelopmentBlockError,
    'development requires "sync"',
  );
});

Deno.test("parseDevelopmentBlock: throws when sync isn't a list", () => {
  assertThrows(
    () => parseDevelopmentBlock({ sync: "nope" }),
    DevelopmentBlockError,
    "development.sync must be a list",
  );
});

Deno.test("parseDevelopmentBlock: throws when a sync rule isn't a mapping", () => {
  assertThrows(
    () => parseDevelopmentBlock({ sync: ["nope"] }),
    DevelopmentBlockError,
    "development.sync[0] must be a mapping",
  );
});

Deno.test("parseDevelopmentBlock: throws on an unknown sync rule key", () => {
  assertThrows(
    () =>
      parseDevelopmentBlock({
        sync: [{ app: "a", path: "/a", watch: true }],
      }),
    DevelopmentBlockError,
    'development.sync[0] has no key "watch"',
  );
});

Deno.test("parseDevelopmentBlock: throws when app is missing", () => {
  assertThrows(
    () => parseDevelopmentBlock({ sync: [{ path: "/a" }] }),
    DevelopmentBlockError,
    'development.sync[0] requires "app"',
  );
});

Deno.test("parseDevelopmentBlock: throws when path is missing", () => {
  assertThrows(
    () => parseDevelopmentBlock({ sync: [{ app: "a" }] }),
    DevelopmentBlockError,
    'development.sync[0] requires "path"',
  );
});

Deno.test("parseDevelopmentBlock: throws on an invalid action value", () => {
  assertThrows(
    () =>
      parseDevelopmentBlock({
        sync: [{ app: "a", path: "/a", action: "rebuild" }],
      }),
    DevelopmentBlockError,
    'development.sync[0] "action" must be "sync" or "sync+restart"',
  );
});

Deno.test("parseDevelopmentBlock: throws when ignore isn't a list of strings", () => {
  assertThrows(
    () =>
      parseDevelopmentBlock({
        sync: [{ app: "a", path: "/a", ignore: [1, 2] }],
      }),
    DevelopmentBlockError,
    'development.sync[0] "ignore" must be a list of strings',
  );
});

Deno.test("parseDevelopmentBlock: an empty sync list is valid (a watchable resource with nothing to sync)", () => {
  const block = parseDevelopmentBlock({ sync: [] });
  assertEquals(block, { sync: [] });
});
