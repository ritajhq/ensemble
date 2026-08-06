import { assertEquals, assertThrows } from "@std/assert";
import type { ManualInput } from "@ensemble/workflow";
import { extractManualInputs, ManualInputError, resolveJobInput } from "./extract.ts";

Deno.test("extractManualInputs: reads a submitted string value", () => {
  const declared: ManualInput[] = [{ name: "sha", type: "string" }];
  assertEquals(extractManualInputs({ sha: "abc123" }, declared), { sha: "abc123" });
});

Deno.test("extractManualInputs: missing required input (no default) throws", () => {
  const declared: ManualInput[] = [{ name: "sha", type: "string" }];
  assertThrows(() => extractManualInputs({}, declared), ManualInputError, 'Missing required input "sha"');
});

Deno.test("extractManualInputs: missing optional input falls back to default", () => {
  const declared: ManualInput[] = [{ name: "replicas", type: "number", default: 1 }];
  assertEquals(extractManualInputs({}, declared), { replicas: 1 });
  assertEquals(extractManualInputs(undefined, declared), { replicas: 1 });
});

Deno.test("extractManualInputs: submitted value overrides default", () => {
  const declared: ManualInput[] = [{ name: "replicas", type: "number", default: 1 }];
  assertEquals(extractManualInputs({ replicas: 5 }, declared), { replicas: 5 });
});

Deno.test("extractManualInputs: strict type mismatch throws (number rejects numeric string)", () => {
  const declared: ManualInput[] = [{ name: "replicas", type: "number" }];
  assertThrows(
    () => extractManualInputs({ replicas: "3" }, declared),
    ManualInputError,
    'Input "replicas" must be a number',
  );
});

Deno.test("extractManualInputs: boolean type mismatch throws", () => {
  const declared: ManualInput[] = [{ name: "enabled", type: "boolean" }];
  assertThrows(
    () => extractManualInputs({ enabled: "true" }, declared),
    ManualInputError,
    'Input "enabled" must be a boolean',
  );
});

Deno.test("extractManualInputs: object type accepts a plain object, rejects an array", () => {
  const declared: ManualInput[] = [{ name: "config", type: "object" }];
  assertEquals(extractManualInputs({ config: { a: 1 } }, declared), { config: { a: 1 } });
  assertThrows(
    () => extractManualInputs({ config: [1, 2] }, declared),
    ManualInputError,
    'Input "config" must be a object',
  );
});

Deno.test("extractManualInputs: git-tags and context validate as plain strings", () => {
  const declared: ManualInput[] = [
    { name: "release_tag", type: "git-tags", repository: "https://example.com/repo.git" },
    { name: "deploy_target", type: "context" },
  ];
  assertEquals(
    extractManualInputs({ release_tag: "v1.2.3", deploy_target: "production" }, declared),
    { release_tag: "v1.2.3", deploy_target: "production" },
  );
  assertThrows(
    () => extractManualInputs({ release_tag: 123 }, [declared[0]]),
    ManualInputError,
    'Input "release_tag" must be a git-tags',
  );
});

Deno.test("extractManualInputs: no declared inputs yields an empty trigger", () => {
  assertEquals(extractManualInputs({ anything: "goes" }, []), {});
});

Deno.test("extractManualInputs: job type accepts a value matching a declared job id", () => {
  const declared: ManualInput[] = [{ name: "which_job", type: "job" }];
  assertEquals(
    extractManualInputs({ which_job: "deploy" }, declared, ["build", "deploy"]),
    { which_job: "deploy" },
  );
});

Deno.test("extractManualInputs: job type rejects a value that isn't a declared job id", () => {
  const declared: ManualInput[] = [{ name: "which_job", type: "job" }];
  assertThrows(
    () => extractManualInputs({ which_job: "nonexistent" }, declared, ["build", "deploy"]),
    ManualInputError,
    'Input "which_job" must be a declared job',
  );
});

Deno.test("resolveJobInput: returns the job-typed input's resolved value", () => {
  const declared: ManualInput[] = [
    { name: "which_job", type: "job" },
    { name: "sha", type: "string" },
  ];
  assertEquals(resolveJobInput(declared, { which_job: "deploy", sha: "abc123" }), "deploy");
});

Deno.test("resolveJobInput: undefined when no job-typed input is declared", () => {
  const declared: ManualInput[] = [{ name: "sha", type: "string" }];
  assertEquals(resolveJobInput(declared, { sha: "abc123" }), undefined);
});

Deno.test("extractManualInputs: job type with multiple: true accepts a non-empty list of declared job ids", () => {
  const declared: ManualInput[] = [{ name: "which_jobs", type: "job", multiple: true }];
  assertEquals(
    extractManualInputs({ which_jobs: ["build", "deploy"] }, declared, ["build", "deploy", "runner"]),
    { which_jobs: ["build", "deploy"] },
  );
});

Deno.test("extractManualInputs: job type with multiple: true rejects a plain string", () => {
  const declared: ManualInput[] = [{ name: "which_jobs", type: "job", multiple: true }];
  assertThrows(
    () => extractManualInputs({ which_jobs: "build" }, declared, ["build"]),
    ManualInputError,
    'Input "which_jobs" must be a non-empty list of job ids',
  );
});

Deno.test("extractManualInputs: job type with multiple: true rejects an empty list", () => {
  const declared: ManualInput[] = [{ name: "which_jobs", type: "job", multiple: true }];
  assertThrows(
    () => extractManualInputs({ which_jobs: [] }, declared, ["build"]),
    ManualInputError,
    'Input "which_jobs" must be a non-empty list of job ids',
  );
});

Deno.test("extractManualInputs: job type with multiple: true rejects a list containing an unknown job", () => {
  const declared: ManualInput[] = [{ name: "which_jobs", type: "job", multiple: true }];
  assertThrows(
    () => extractManualInputs({ which_jobs: ["build", "nonexistent"] }, declared, ["build", "deploy"]),
    ManualInputError,
    'Input "which_jobs" must be a declared job ("nonexistent")',
  );
});

Deno.test("resolveJobInput: returns a list when the job-typed input declared multiple: true", () => {
  const declared: ManualInput[] = [{ name: "which_jobs", type: "job", multiple: true }];
  assertEquals(resolveJobInput(declared, { which_jobs: ["build", "deploy"] }), ["build", "deploy"]);
});
