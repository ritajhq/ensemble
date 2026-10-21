import { assertEquals } from "@std/assert";
import gateway, { matches } from "./gateway.js";

const ROUTES = JSON.stringify([
  { path: "/v1/*", kind: "service", binding: "SERVICE_api" },
  { path: "/files/*", kind: "bucket", binding: "BUCKET_files" },
  { path: "/*", kind: "assets", binding: "ASSETS" },
]);

function bucket(objects: Record<string, string>) {
  const found = (key: string) => {
    const text = objects[key];
    if (text === undefined) return null;
    return {
      size: text.length,
      httpEtag: `"${key}"`,
      writeHttpMetadata: (headers: Headers) =>
        headers.set("content-type", "application/pdf"),
      body: text,
    };
  };
  return {
    get: (key: string) => Promise.resolve(found(key)),
    head: (key: string) => Promise.resolve(found(key)),
  };
}

const env = {
  ENSEMBLE_ROUTES: ROUTES,
  SERVICE_api: {
    fetch: (request: Request) =>
      Promise.resolve(new Response(`api ${new URL(request.url).pathname}`)),
  },
  ASSETS: { fetch: () => Promise.resolve(new Response("<html>")) },
  BUCKET_files: bucket({ "files/a/deck.pdf": "%PDF" }),
};

Deno.test("gateway: matches exact paths, prefixes and the catch-all", () => {
  assertEquals([
    matches("/v1/*", "/v1/lab"),
    matches("/v1/*", "/v10"),
    matches("/health", "/health"),
    matches("/*", "/x"),
  ], [
    true,
    false,
    true,
    true,
  ]);
});

Deno.test("gateway: hands each request to what its route names", async () => {
  const fetch = (path: string, init?: RequestInit) =>
    gateway.fetch(new Request(`https://gw.example${path}`, init), env);
  assertEquals(
    await (await fetch("/v1/lab/experiences")).text(),
    "api /v1/lab/experiences",
  );
  assertEquals(await (await fetch("/experiences/42")).text(), "<html>");
  const file = await fetch("/files/a/deck.pdf");
  assertEquals([
    file.status,
    file.headers.get("content-type"),
    await file.text(),
  ], [200, "application/pdf", "%PDF"]);
  assertEquals((await fetch("/files/a/missing.pdf")).status, 404);
  assertEquals(
    (await fetch("/files/a/deck.pdf", { method: "PUT", body: "x" })).status,
    405,
  );
});
