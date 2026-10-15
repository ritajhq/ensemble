import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import * as Platform from "@ensemble/platform";
import { Caddyfile } from "./caddyfile.ts";

const table = Platform.RoutingTable.of(
  [
    {
      owner: "portal/portal/production",
      ingresses: [{
        alias: "portal-portal",
        port: 80,
        scheme: "http",
        hosts: ["ritaj.app"],
      }],
    },
    {
      owner: "portal/portal/preview-feat-x",
      ingresses: [{
        alias: "portal-portal--preview-feat-x",
        port: 80,
        scheme: "http",
        hosts: ["feat-x--portal.ensemble.blue"],
        rewrites: {
          "feat-x--portal.ensemble.blue": "feat-x.portal.preview.internal",
        },
        guarded: true,
      }],
    },
  ],
  [{
    owner: "platform",
    ingresses: [{
      alias: "guard",
      port: 8080,
      scheme: "http",
      hosts: ["platform.ensemble.blue"],
    }],
  }],
);

/** The handler block for `host`'s matcher. */
function handlerOf(caddyfile: string, host: string): string {
  const matcher = caddyfile.split("\n").find((line) =>
    line.includes(" host ") && line.includes(host)
  )!;
  const name = matcher.trim().split(" ")[0];
  const start = caddyfile.indexOf(`handle ${name} {`);
  return caddyfile.slice(start, caddyfile.indexOf("\n\t}", start));
}

Deno.test("Caddyfile: a preview is reached only through the guard, with only the identity the guard gave", () => {
  const caddyfile = new Caddyfile(table, {
    guard: { host: "guard-previews", port: 8080 },
    sessionCookie: "__Secure-platform.session_token",
  }).text();
  const preview = handlerOf(caddyfile, "feat-x--portal.ensemble.blue");

  // Written order matters, and only a `route` keeps it: outside one, Caddy
  // runs request_header after forward_auth, dropping the guard's identity.
  assertStringIncludes(preview, "route {");
  assertStringIncludes(preview, "request_header -X-Idhn-Subject");
  assertStringIncludes(preview, "forward_auth http://guard-previews:8080 {");
  assertStringIncludes(
    preview,
    "copy_headers X-Idhn-Subject X-Idhn-Issuer X-Idhn-Claims",
  );
  assertStringIncludes(
    preview,
    "header_up Host feat-x.portal.preview.internal",
  );
  assert(
    preview.indexOf("request_header") < preview.indexOf("forward_auth") &&
      preview.indexOf("forward_auth") < preview.indexOf("reverse_proxy"),
  );
  assertStringIncludes(caddyfile, ":8082 {");
});

Deno.test("Caddyfile: without a guard, a preview can't be reached at all", () => {
  const preview = handlerOf(
    new Caddyfile(table).text(),
    "feat-x--portal.ensemble.blue",
  );
  assertStringIncludes(preview, "503");
  assertEquals(preview.includes("reverse_proxy"), false);
});

Deno.test("Caddyfile: every deployment loses the platform's session cookie; the platform's own routes keep it", () => {
  const caddyfile = new Caddyfile(table, {
    sessionCookie: "__Secure-platform.session_token",
  }).text();
  const cookie =
    'header_up Cookie "(^|;\\s*)__Secure-platform\\.session_token=[^;]*" ""';

  assertStringIncludes(handlerOf(caddyfile, "ritaj.app"), cookie);
  assertEquals(
    handlerOf(caddyfile, "platform.ensemble.blue").includes("Cookie"),
    false,
  );
  assertStringIncludes(
    handlerOf(caddyfile, "platform.ensemble.blue"),
    "reverse_proxy http://guard:8080",
  );
});
