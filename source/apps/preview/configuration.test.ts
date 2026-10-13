import { assertEquals, assertThrows } from "@std/assert";
import { Configuration } from "./configuration.ts";

const YAML = `
domain: preview.ritaj.app
workspace: /var/lib/ens-previews
repositories:
  portal:
    repo: ritajhq/portal
    delivery: portal
    branches:
      - main
      - feat/*
    envFiles:
      - ci/portal/preview.env
`;

Deno.test("Configuration tracks only the branches a repository lists, globs included", () => {
  const portal = Configuration.parse(YAML).repository("portal")!;
  assertEquals(portal.tracks("main"), true);
  assertEquals(portal.tracks("feat/login"), true);
  assertEquals(portal.tracks("fix/login"), false);
  assertEquals(portal.tracks("mainline"), false);
});

Deno.test("Configuration hands a preview its host and the variables a manifest reads", () => {
  const configuration = Configuration.parse(YAML);
  const preview = configuration.previewOf(
    configuration.repository("portal")!,
    "main",
  );

  assertEquals(preview.host, "main.preview.ritaj.app");
  assertEquals(preview.environment, {
    INGRESS_NETWORKS: "preview",
    GATEWAY_ALIAS: "main",
    PUBLIC_HOST: "main.preview.ritaj.app",
  });
});

Deno.test("Configuration lets a repository rename the variables it reads", () => {
  const configuration = Configuration.parse(
    YAML + "    variables:\n      app-host: https://{host}\n",
  );
  const preview = configuration.previewOf(
    configuration.repository("portal")!,
    "main",
  );
  assertEquals(preview.environment.APP_HOST, "https://main.preview.ritaj.app");
});

Deno.test("Configuration names what is wrong with the file", () => {
  assertThrows(
    () =>
      Configuration.parse(
        "domain: a.b\nworkspace: /w\nrepositories: {}\nx: 1\n".replace(
          "repositories: {}",
          "repositories:\n  p:\n    repo: nope\n    delivery: d\n    branches: [main]",
        ),
      ),
    Error,
    'repositories.p.repo must look like "owner/name"',
  );
});
