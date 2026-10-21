import { assertEquals, assertThrows } from "@std/assert";
import { keyValueV1 } from "../contracts/seeds/key-value.ts";
import { objectStorageV1 } from "../contracts/seeds/object-storage.ts";
import {
  envIdOf,
  envOutputOf,
  GrantDescriptor,
  GrantDescriptorError,
} from "./grant-descriptor.ts";
import type { MatchedResource } from "./matched-resource.ts";
import type { ProvisioningRequest } from "./provisioning-request.ts";

const matches = new Map<string, MatchedResource>([
  ["databases.experiences", {
    category: "databases",
    name: "experiences",
    contract: keyValueV1,
    declaration: {
      type: "key-value",
      params: { keySchema: { partition: "PK", sort: "SK" } },
    },
  }],
  ["storage.editor-files", {
    category: "storage",
    name: "editor-files",
    contract: objectStorageV1,
    declaration: { type: "object-storage", params: { bucket: "b" } },
  }],
]);

function api(params: Record<string, unknown>): ProvisioningRequest {
  return {
    category: "compute",
    name: "api",
    type: "function",
    params: { code: "x", ...params },
    values: {},
  };
}

const describer = new GrantDescriptor();

Deno.test("GrantDescriptor: a function is told what it's granted, one variable per contract output, each the whole reference", () => {
  const described = describer.describe(
    api({
      env: { OTHER: "kept" },
      tables: ["${databases.experiences.name}"],
      buckets: ["${storage.editor-files.bucket}"],
    }),
    matches,
  );

  assertEquals(described.params.env, {
    OTHER: "kept",
    ENSEMBLE_RESOURCES: "experiences,editor-files",
    ENSEMBLE_RESOURCE_EXPERIENCES_TYPE: "key-value",
    ENSEMBLE_RESOURCE_EXPERIENCES_NAME: "${databases.experiences.name}",
    ENSEMBLE_RESOURCE_EXPERIENCES_ENGINE: "${databases.experiences.engine}",
    ENSEMBLE_RESOURCE_EXPERIENCES_PARTITION:
      "${databases.experiences.partition}",
    ENSEMBLE_RESOURCE_EXPERIENCES_SORT: "${databases.experiences.sort}",
    ENSEMBLE_RESOURCE_EDITOR_FILES_TYPE: "object-storage",
    ENSEMBLE_RESOURCE_EDITOR_FILES_URL: "${storage.editor-files.url}",
    ENSEMBLE_RESOURCE_EDITOR_FILES_PUBLIC_URL:
      "${storage.editor-files.publicUrl}",
    ENSEMBLE_RESOURCE_EDITOR_FILES_BUCKET: "${storage.editor-files.bucket}",
    ENSEMBLE_RESOURCE_EDITOR_FILES_ENGINE: "${storage.editor-files.engine}",
  });
});

Deno.test("GrantDescriptor: nothing is added to a function with no grants, or to anything that isn't one", () => {
  const bare = api({});
  assertEquals(describer.describe(bare, matches), bare);
  const container: ProvisioningRequest = {
    ...bare,
    type: "container-orchestrated",
    params: { tables: ["${databases.experiences.name}"] },
  };
  assertEquals(describer.describe(container, matches), container);
});

Deno.test("GrantDescriptor: a variable the function's own env already sets is an error, not an override", () => {
  assertThrows(
    () =>
      describer.describe(
        api({
          env: { ENSEMBLE_RESOURCES: "mine" },
          tables: ["${databases.experiences.name}"],
        }),
        matches,
      ),
    GrantDescriptorError,
    "env sets ENSEMBLE_RESOURCES",
  );
});

Deno.test("GrantDescriptor: names that become the same variable are an error", () => {
  const clashing = new Map(matches).set("storage.editor_files", {
    ...matches.get("storage.editor-files")!,
    name: "editor_files",
  });
  assertThrows(
    () =>
      describer.describe(
        api({
          buckets: [
            "${storage.editor-files.bucket}",
            "${storage.editor_files.bucket}",
          ],
        }),
        clashing,
      ),
    GrantDescriptorError,
    "both ENSEMBLE_RESOURCE_EDITOR_FILES_",
  );
});

Deno.test("GrantDescriptor: a resource's name and an output's become variable names the same way everywhere", () => {
  assertEquals([
    envIdOf("editor-site"),
    envIdOf("a.b__c"),
    envOutputOf("publicUrl"),
    envOutputOf("name"),
  ], ["EDITOR_SITE", "A_B_C", "PUBLIC_URL", "NAME"]);
});
