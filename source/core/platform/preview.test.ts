import { assertEquals, assertThrows } from "@std/assert";
import { Environment, InvalidEnvironmentError } from "./environment.ts";
import { InvalidTemplateError, Preview } from "./preview.ts";
import {
  InvalidPreviewSettingsError,
  PreviewSettings,
} from "./preview-settings.ts";

const preview = Preview.of({
  project: "portal",
  manifest: "portal",
  branch: "feat-x",
  domain: "ensemble.blue",
});

Deno.test("Preview: deployed as an instance no environment can be named like", () => {
  assertEquals(preview.instance, "preview-feat-x");
  assertEquals(preview.owner, "portal/portal/preview-feat-x");
  assertThrows(
    () => Environment.create("portal", "portal", "preview-feat-x"),
    InvalidEnvironmentError,
  );
});

Deno.test("Preview: each internal host is published as one label under the preview domain", () => {
  assertEquals(preview.internalDomain, "feat-x.portal.preview.internal");
  assertEquals(
    preview.publicHostOf("feat-x.portal.preview.internal"),
    "feat-x--portal.ensemble.blue",
  );
  assertEquals(
    preview.publicHostOf("dashboard.feat-x.portal.preview.internal"),
    "dashboard--feat-x--portal.ensemble.blue",
  );
  assertEquals(
    preview.publicHostOf("a.b.feat-x.portal.preview.internal"),
    "a-b--feat-x--portal.ensemble.blue",
  );
  assertEquals(preview.publicHostOf("ritaj.app"), undefined);
});

Deno.test("Preview: a host too long for one label is shortened with a fingerprint, still one label", () => {
  const host = preview.publicHost("a-very-long-subdomain-name-indeed-yes");
  const [label] = host.split(".");
  assertEquals(label.length <= 63, true);
  assertEquals(
    host,
    preview.publicHost("a-very-long-subdomain-name-indeed-yes"),
  );
});

Deno.test("Preview: templates are filled with the preview's own values", () => {
  assertEquals(
    preview.render("https://{host:dashboard}"),
    "https://dashboard--feat-x--portal.ensemble.blue",
  );
  assertEquals(preview.render("{internal}"), "feat-x.portal.preview.internal");
  assertEquals(preview.render("portal-{slug}"), "portal-feat-x");
  assertThrows(() => Preview.check("{nope}"), InvalidTemplateError);
  assertThrows(() => Preview.check("{slug:x}"), InvalidTemplateError);
});

Deno.test("PreviewSettings: never start from production, and track branches by pattern", () => {
  const fields = {
    project: "portal",
    manifest: "portal",
    branches: ["feat/*"],
    base: "preview",
    kit: "compose",
    overrides: { domain: "{internal}" },
  };
  assertThrows(
    () => PreviewSettings.create({ ...fields, base: "production" }),
    InvalidPreviewSettingsError,
  );
  assertThrows(
    () => PreviewSettings.create({ ...fields, overrides: { x: "{nope}" } }),
    InvalidTemplateError,
  );
  const settings = PreviewSettings.create(fields);
  assertEquals(settings.tracks("feat/login"), true);
  assertEquals(settings.tracks("main"), false);
});
