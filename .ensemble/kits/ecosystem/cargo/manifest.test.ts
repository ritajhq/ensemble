import { assertEquals, assertThrows } from "@std/assert";
import { Manifest } from "./manifest.ts";

const CRATE = `# Keeps the books.
[package]
name = "ledger"
version = "0.1.0" # moved by a release

[dependencies]
rounding = { path = "../rounding", version = "0.1.0" }
serde = "1.0"
plain = "0.1.0"
renamed = { package = "rounding", path = "../rounding", version = "0.1.0" }
unversioned = { path = "../unversioned" }

[dev-dependencies.rounding]
path = "../rounding"
version = "0.1.0"

[target.'cfg(unix)'.dependencies]
plain = "0.1.0"
`;

Deno.test("Manifest.withVersion: only [package]'s version moves, comments stay", () => {
  const stamped = new Manifest(CRATE).withVersion("0.2.0");

  assertEquals(
    stamped.includes('version = "0.2.0" # moved by a release'),
    true,
  );
  assertEquals(stamped.includes("# Keeps the books."), true);
  assertEquals(
    stamped.includes('rounding = { path = "../rounding", version = "0.1.0" }'),
    true,
  );
});

Deno.test("Manifest.withVersion: a crate inheriting its version is refused", () => {
  assertThrows(
    () =>
      new Manifest(`[package]\nversion.workspace = true\n`).withVersion(
        "0.2.0",
      ),
    Error,
    "inheriting",
  );
});

Deno.test("Manifest.repinned: every form of dependency on a name moves, and nothing else", () => {
  const repinned = new Manifest(CRATE).repinned(["rounding", "plain"], "0.2.0");

  assertEquals(
    repinned,
    `# Keeps the books.
[package]
name = "ledger"
version = "0.1.0" # moved by a release

[dependencies]
rounding = { path = "../rounding", version = "0.2.0" }
serde = "1.0"
plain = "0.2.0"
renamed = { package = "rounding", path = "../rounding", version = "0.2.0" }
unversioned = { path = "../unversioned" }

[dev-dependencies.rounding]
path = "../rounding"
version = "0.2.0"

[target.'cfg(unix)'.dependencies]
plain = "0.2.0"
`,
  );
});

Deno.test("Manifest.repinned: a manifest depending on none of the names is unchanged", () => {
  assertEquals(new Manifest(CRATE).repinned(["other"], "0.2.0"), CRATE);
});

Deno.test("Manifest.withWorkspace: adds the line to [package], or corrects it", () => {
  const added = new Manifest(
    `[package]\nname = "a"\n\n[dependencies]\nb = "1"\n`,
  )
    .withWorkspace("../root");
  assertEquals(
    added,
    `[package]\nname = "a"\nworkspace = "../root"\n\n[dependencies]\nb = "1"\n`,
  );
  assertEquals(new Manifest(added).withWorkspace("../root"), added);
  assertEquals(
    new Manifest(added).withWorkspace("../moved"),
    added.replace("../root", "../moved"),
  );
});

Deno.test("Manifest.withMembers: replaces the list, however it was written", () => {
  assertEquals(
    new Manifest(`[workspace]\nmembers = []\n`).withMembers(["../a", "../b"]),
    `[workspace]\nmembers = [\n  "../a",\n  "../b",\n]\n`,
  );
  assertEquals(
    new Manifest(`[workspace]\nmembers = [\n  "old",\n]\n`).withMembers([]),
    `[workspace]\nmembers = [\n]\n`,
  );
});
