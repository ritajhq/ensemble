import { assertEquals } from "@std/assert";
import { RoutingTable } from "./routing-table.ts";

const gateway = (alias: string, hosts: string[]) => ({
  alias,
  port: 80,
  scheme: "http" as const,
  hosts,
});

Deno.test("RoutingTable: every host a deployment answers for goes to its alias", () => {
  const table = RoutingTable.of([{
    owner: "portal/portal/production",
    ingresses: [
      gateway("portal-portal", ["ritaj.app", "Dashboard.ritaj.app", ""]),
    ],
  }]);

  assertEquals(table.routes.map((route) => route.host), [
    "dashboard.ritaj.app",
    "ritaj.app",
  ]);
  assertEquals(table.routes[0].upstream, {
    alias: "portal-portal",
    port: 80,
    scheme: "http",
  });
  assertEquals(table.conflicts, []);
});

Deno.test("RoutingTable: a host two deployments claim goes to the first by owner, and is reported", () => {
  const table = RoutingTable.of([
    {
      owner: "web/web/staging",
      ingresses: [gateway("web-web--staging", ["a.example.com"])],
    },
    {
      owner: "web/web/production",
      ingresses: [gateway("web-web", ["a.example.com"])],
    },
  ]);

  assertEquals(table.routes.length, 1);
  assertEquals(table.routes[0].owner, "web/web/production");
  assertEquals(table.conflicts, [{
    host: "a.example.com",
    owners: ["web/web/production", "web/web/staging"],
  }]);
});

Deno.test("RoutingTable: a host or alias that could be read as configuration is rejected, never routed", () => {
  const table = RoutingTable.of([{
    owner: "evil/evil/production",
    ingresses: [
      gateway("evil", [
        "ok.example.com",
        "x.com {\n\treverse_proxy attacker\n}",
      ]),
      gateway("evil }", ["other.example.com"]),
    ],
  }]);

  assertEquals(table.routes.map((route) => route.host), ["ok.example.com"]);
  assertEquals(table.rejections.map((rejection) => rejection.value), [
    "x.com {\n\treverse_proxy attacker\n}",
    "evil }",
  ]);
});

Deno.test("RoutingTable: a reserved host stays the platform's, whoever else claims it", () => {
  const table = RoutingTable.of(
    [{
      owner: "aaa/web/production",
      ingresses: [gateway("aaa-web", ["platform.example.com"])],
    }],
    [{
      owner: "platform",
      ingresses: [gateway("platform", ["platform.example.com"])],
    }],
  );
  assertEquals(table.routes[0].owner, "platform");
  assertEquals(table.conflicts[0].owners, ["platform", "aaa/web/production"]);
});
