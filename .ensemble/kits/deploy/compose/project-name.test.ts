import { assertEquals } from "@std/assert";
import { ComposeProject } from "./project-name.ts";
import { composeRealization } from "./realization.ts";

Deno.test("compose project: named as compose cleans the deployment's name", () => {
  assertEquals(
    new ComposeProject("ensemble-platform").name,
    "ensemble-platform",
  );
  assertEquals(new ComposeProject("My Repo_Platform").name, "myrepo_platform");
  assertEquals(new ComposeProject("-_shop").name, "shop");
});

Deno.test("compose project: a compute's container is the first replica of its service", () => {
  assertEquals(
    new ComposeProject("ensemble-platform").containerOf("judge"),
    "ensemble-platform-judge-1",
  );
});

Deno.test("compose realization: a container's host is its container name in the deployment", async () => {
  const realization = await composeRealization();
  assertEquals(
    await realization.hostOf?.("compute", "container", "judge", "shop-web"),
    "shop-web-judge-1",
  );
});

Deno.test("compose realization: a compute of another type has no host", async () => {
  const realization = await composeRealization();
  assertEquals(
    await realization.hostOf?.("compute", "function", "judge", "shop-web"),
    undefined,
  );
});
