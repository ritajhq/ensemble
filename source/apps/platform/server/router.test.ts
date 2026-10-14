import { assertEquals, assertStringIncludes } from "@std/assert";
import * as Platform from "@ensemble/platform";
import * as Kv from "./kv.ts";
import { Router } from "./router.ts";

const deployment = (environment: string) =>
  Platform.Deployment.create({
    project: "portal",
    manifest: "portal",
    environment,
    kit: "compose",
    version: "1.0.0",
    termination: "apply",
  });

async function withRouter(
  run: (router: Router, configuration: string) => Promise<void>,
): Promise<void> {
  const kv = await Deno.openKv(":memory:");
  const configuration = `${await Deno.makeTempDir()}/router/Caddyfile`;
  try {
    await run(new Router(new Kv.Ingresses(kv), configuration), configuration);
  } finally {
    kv.close();
  }
}

Deno.test("Router: a deployment's hosts are routed to its alias, every other host answered 404", async () => {
  await withRouter(async (router, configuration) => {
    await router.publish();
    assertStringIncludes(
      await Deno.readTextFile(configuration),
      'respond "No deployment answers for this host." 404',
    );

    await router.deployed(deployment("production"), [{
      alias: "portal-portal",
      scheme: "http",
      port: 80,
      hosts: ["ritaj.app", "dashboard.ritaj.app"],
    }]);

    const caddyfile = await Deno.readTextFile(configuration);
    assertStringIncludes(
      caddyfile,
      "@upstream0 host dashboard.ritaj.app ritaj.app",
    );
    assertStringIncludes(caddyfile, "reverse_proxy http://portal-portal:80");
  });
});

Deno.test("Router: an environment deployed again replaces what it answered for before", async () => {
  await withRouter(async (router) => {
    const ingress = (hosts: string[]) => [{
      alias: "portal-portal--staging",
      scheme: "http" as const,
      port: 80,
      hosts,
    }];
    await router.deployed(deployment("staging"), ingress(["old.ritaj.app"]));
    await router.deployed(deployment("staging"), ingress(["new.ritaj.app"]));

    assertEquals(
      (await router.table()).routes.map((route) => route.host),
      ["new.ritaj.app"],
    );
  });
});

Deno.test("Router: a gateway answering over its own TLS is proxied to as it is", async () => {
  await withRouter(async (router, configuration) => {
    await router.deployed(deployment("production"), [{
      alias: "portal-portal",
      scheme: "https",
      port: 443,
      hosts: ["ritaj.app"],
    }]);
    assertStringIncludes(
      await Deno.readTextFile(configuration),
      "reverse_proxy https://portal-portal:443 {",
    );
  });
});
