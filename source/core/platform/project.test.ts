import { assertEquals, assertThrows } from "@std/assert";
import { InvalidProjectError, Project } from "./project.ts";
import { Environment, InvalidEnvironmentError } from "./environment.ts";

Deno.test("Project: is cloned from GitHub over https, with no credentials in the URL", () => {
  const project = Project.create({
    id: "portal",
    repository: "ritajhq/portal",
    ref: "main",
  });
  assertEquals(project.cloneUrl, "https://github.com/ritajhq/portal.git");
});

Deno.test("Project: an id must stay a short DNS label, since every deployment name starts with it", () => {
  for (const id of ["Portal", "-portal", "a".repeat(21), "por_tal"]) {
    assertThrows(
      () => Project.create({ id, repository: "ritajhq/portal", ref: "main" }),
      InvalidProjectError,
    );
  }
});

Deno.test("Project: a repository is owner/name, and a ref is never read as an option", () => {
  assertThrows(
    () => Project.create({ id: "portal", repository: "portal", ref: "main" }),
    InvalidProjectError,
  );
  assertThrows(
    () =>
      Project.create({
        id: "portal",
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
