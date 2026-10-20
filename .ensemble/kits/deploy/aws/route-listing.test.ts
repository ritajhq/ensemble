import { assertEquals } from "@std/assert";
import { RouteListing } from "./route-listing.ts";

const GATEWAY = {
  url: "https://d1abc.cloudfront.net",
  targets: [
    { service: "api", paths: ["/v1/*"] },
    { service: "editor-site", paths: ["/*"] },
  ],
};

Deno.test("RouteListing: each route target with the gateway's URL and its paths, aligned", () => {
  assertEquals(new RouteListing(undefined).lines([GATEWAY]), [
    "Routes:",
    "  api          https://d1abc.cloudfront.net  /v1/*",
    "  editor-site  https://d1abc.cloudfront.net  /*",
  ]);
});

Deno.test("RouteListing: the environment's CloudFront address replaces https://<id>.cloudfront.net, scheme and port included", () => {
  assertEquals(
    new RouteListing("http://cloudfront.lvh.me:8080").lines([GATEWAY])[1],
    "  api          http://d1abc.cloudfront.lvh.me:8080  /v1/*",
  );
});

Deno.test("RouteListing: no gateway, no listing", () => {
  assertEquals(new RouteListing(undefined).lines([]), []);
});
