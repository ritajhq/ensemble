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
