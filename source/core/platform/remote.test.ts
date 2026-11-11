import { assertEquals } from "@std/assert";
import { Remote } from "./remote.ts";

Deno.test("Remote: reads owner/name from every form git spells a GitHub remote in", () => {
  for (
    const url of [
      "https://github.com/ritajhq/portal.git",
      "https://github.com/ritajhq/portal",
      "https://x-access-token:secret@github.com/ritajhq/portal.git",
      "git@github.com:ritajhq/portal.git",
      "ssh://git@github.com/ritajhq/portal.git\n",
    ]
  ) {
    assertEquals(Remote.ofUrl(url)?.repository, "ritajhq/portal");
  }
});

Deno.test("Remote: a remote off GitHub names no repository", () => {
  assertEquals(
    Remote.ofUrl("https://gitlab.com/ritajhq/portal.git"),
    undefined,
  );
  assertEquals(Remote.ofUrl("/srv/git/portal.git"), undefined);
});
