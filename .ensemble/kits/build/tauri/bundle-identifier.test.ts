import { assertEquals, assertMatch } from "@std/assert";
import { BundleIdentifier } from "./bundle-identifier.ts";

function identifier(remote: string | undefined, crate = "x"): string {
  return BundleIdentifier.for(remote, "my_project", crate).toString();
}

for (
  const remote of [
    "https://github.com/ritajhq/harness",
    "https://github.com/ritajhq/harness.git",
    "https://user:token@github.com/ritajhq/harness.git",
    "git@github.com:ritajhq/harness.git",
    "ssh://git@github.com/ritajhq/harness.git",
    "ssh://git@github.com:22/ritajhq/harness.git",
  ]
) {
  Deno.test(`for: ${remote} gives its host and owner`, () => {
    assertEquals(identifier(remote), "com.github.ritajhq.x");
  });
}

Deno.test("for: any host reverses, and a subgroup's owner is its top level", () => {
  assertEquals(
    identifier("https://gitlab.example.org/acme/tools/app.git"),
    "org.example.gitlab.acme.x",
  );
});

for (
  const remote of [
    undefined,
    "",
    "/srv/git/harness.git",
    "../harness.git",
    "file:///srv/git/harness.git",
    "https://localhost/ritajhq/harness.git",
    "https://192.168.1.10/ritajhq/harness.git",
    "https://github.com/harness",
    "not a remote",
  ]
) {
  Deno.test(`for: ${JSON.stringify(remote)} falls back to the project's name`, () => {
    assertEquals(identifier(remote), "local.my-project.x");
  });
}

for (
  const [remote, crate] of [
    ["https://github.com/some_owner/repo.git", "my_shell_2"],
    ["git@git.my_host.io:Owner.Name/repo.git", "a.b_c"],
    [undefined, "__weird__"],
    ["https://github.com/-_-/repo.git", "x"],
  ] as const
) {
  Deno.test(`for: ${remote} and ${crate} satisfy Tauri's rules`, () => {
    assertMatch(identifier(remote, crate), /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/);
  });
}
