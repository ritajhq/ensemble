import { assertEquals } from "@std/assert";
import { nginxConf } from "./nginx-config.ts";

Deno.test("nginxConf: a plain string path passes the full request URI through unchanged (no strip)", () => {
  const conf = nginxConf([
    {
      host: "a.localhost",
      path: "/cover*",
      target: { service: "cover", port: 8080 },
    },
  ]);

  assertEquals(
    conf,
    `events {}

http {
  server {
    listen 80;
    server_name a.localhost;

    location /cover {
      proxy_pass http://cover:8080;
    }
  }
}
`,
  );
});

Deno.test("nginxConf: { match, strip: true } strips the matched prefix via matching trailing slashes on location and proxy_pass", () => {
  const conf = nginxConf([
    {
      host: "a.localhost",
      path: { match: "/api/*", strip: true },
      target: { service: "api", port: 4000 },
    },
  ]);

  assertEquals(conf.includes("location /api/ {"), true);
  assertEquals(conf.includes("proxy_pass http://api:4000/;"), true);
});

Deno.test("nginxConf: { match, strip: false } behaves exactly like a plain string path", () => {
  const stripped = nginxConf([
    {
      host: "a.localhost",
      path: { match: "/x*" },
      target: { service: "x", port: 1 },
    },
  ]);
  const plain = nginxConf([
    { host: "a.localhost", path: "/x*", target: { service: "x", port: 1 } },
  ]);

  assertEquals(stripped, plain);
});

Deno.test("nginxConf: routes are grouped into one server block per distinct host, in first-seen order", () => {
  const conf = nginxConf([
    { host: "b.localhost", path: "/1", target: { service: "one", port: 1 } },
    { host: "a.localhost", path: "/2", target: { service: "two", port: 2 } },
    { host: "b.localhost", path: "/3", target: { service: "three", port: 3 } },
  ]);

  const bIndex = conf.indexOf("server_name b.localhost;");
  const aIndex = conf.indexOf("server_name a.localhost;");
  assertEquals(bIndex > -1 && aIndex > bIndex, true);
  assertEquals(conf.match(/server_name b\.localhost;/g)?.length, 1);
  assertEquals(conf.includes("location /1 {"), true);
  assertEquals(conf.includes("location /3 {"), true);
});

Deno.test('nginxConf: a bare "/" path (no glob to strip) is left as the root prefix', () => {
  const conf = nginxConf([
    { host: "a.localhost", path: "/*", target: { service: "web", port: 8000 } },
  ]);

  assertEquals(conf.includes("location / {"), true);
});
