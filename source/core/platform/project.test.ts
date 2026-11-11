import { assertEquals, assertThrows } from "@std/assert";
import { InvalidProjectError, Project } from "./project.ts";
import { Environment, InvalidEnvironmentError } from "./environment.ts";

Deno.test("Project: is cloned from GitHub over https, with no credentials in the URL", () => {
  const project = Project.create({
    repository: "ritajhq/portal",
    ref: "main",
  });
  assertEquals(project.cloneUrl, "https://github.com/ritajhq/portal.git");
});

Deno.test("Project: its id is the repository's name as a short DNS label", () => {
  const cases: [string, string][] = [
    ["ritajhq/portal", "portal"],
    ["ritajhq/Material_Dispatcher", "material-dispatcher"],
    ["ritajhq/" + "a".repeat(30), "a".repeat(20)],
    ["ritajhq/.portal.", "portal"],
  ];
  for (const [repository, id] of cases) {
    assertEquals(Project.create({ repository, ref: "main" }).id, id);
  }
  assertThrows(
    () => Project.create({ repository: "ritajhq/___", ref: "main" }),
    InvalidProjectError,
  );
});

Deno.test("Project: a repository is owner/name, and a ref is never read as an option", () => {
  assertThrows(
    () => Project.create({ repository: "portal", ref: "main" }),
    InvalidProjectError,
  );
  assertThrows(
    () =>
      Project.create({
        repository: "ritajhq/portal",
        ref: "--upload-pack=x",
      }),
    InvalidProjectError,
  );
});

Deno.test("Environment: a manifest's first environment is production", () => {
  const first = Environment.first("portal", "portal");
  assertEquals(first.name, "production");
  assertEquals(first.manifest, "portal");
});

Deno.test("Environment: a name is a DNS label", () => {
  assertThrows(
    () =>
      Environment.restore({
        id: "1",
        project: "portal",
        manifest: "portal",
        name: "Staging Env",
      }),
    InvalidEnvironmentError,
  );
});

Deno.test("Environment: another one is created under a name it keeps", () => {
  const staging = Environment.create("portal", "portal", "staging");
  assertEquals(staging.name, "staging");
  assertThrows(
    () => Environment.create("portal", "portal", "Staging"),
    InvalidEnvironmentError,
  );
});
