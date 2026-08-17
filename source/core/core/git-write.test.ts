import { assertEquals, assertRejects } from "@std/assert";
import { createGithubContentsProvider } from "./git-write.ts";

Deno.test("createGithubContentsProvider: putFile rejects a non-PAT auth strategy before making any request", async () => {
  const provider = createGithubContentsProvider();
  await assertRejects(
    () =>
      provider.putFile(
        "https://github.com/acme/widgets",
        { type: "none" },
        "workflows/deploy/contexts/production/secrets.enc",
        new Uint8Array(),
        "Update secrets",
        { name: "ensemble", email: "ensemble@example.com" },
      ),
    Error,
    "write-scoped",
  );
});

Deno.test("createGithubContentsProvider: getFile rejects a non-PAT auth strategy before making any request", async () => {
  const provider = createGithubContentsProvider();
  await assertRejects(
    () =>
      provider.getFile(
        "https://github.com/acme/widgets",
        { type: "none" },
        "some/path",
      ),
    Error,
    "write-scoped",
  );
});

Deno.test("createGithubContentsProvider: putFile rejects a non-GitHub repo URL before making any request", async () => {
  const provider = createGithubContentsProvider();
  await assertRejects(
    () =>
      provider.putFile(
        "https://gitlab.com/acme/widgets",
        { type: "pat", token: "ghp_fake" },
        "some/path",
        new Uint8Array(),
        "Update secrets",
        { name: "ensemble", email: "ensemble@example.com" },
      ),
    Error,
    "doesn't look like a GitHub repository URL",
  );
});

Deno.test("createGithubContentsProvider: accepts both https and ssh GitHub URL forms (parsing only — no network call made until auth passes)", async () => {
  const provider = createGithubContentsProvider();
  // Both should get past URL parsing and fail on the network call itself
  // (no real credentials here) rather than on URL-shape validation —
  // asserting they don't throw the "doesn't look like a GitHub repository
  // URL" message specifically.
  for (
    const repoUrl of [
      "https://github.com/acme/widgets",
      "https://github.com/acme/widgets.git",
      "git@github.com:acme/widgets.git",
    ]
  ) {
    const error = await assertRejects(
      () =>
        provider.getFile(repoUrl, {
          type: "pat",
          token: "ghp_fake_definitely_invalid",
        }, "some/path"),
      Error,
    );
    assertEquals(
      error.message.includes("doesn't look like a GitHub repository URL"),
      false,
    );
  }
});
