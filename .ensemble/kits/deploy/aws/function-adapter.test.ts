import { join, toFileUrl } from "@std/path";
import { assertEquals, assertThrows } from "@std/assert";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { FunctionAdapter } from "./function-adapter.ts";

const ENTRY = `export default {
  async fetch(request, env) {
    const body = request.method === "POST" ? await request.text() : "";
    return new Response(JSON.stringify({ url: request.url, body, greeting: env.GREETING }), {
      status: 201,
      headers: { "content-type": "application/json", "set-cookie": "a=1" },
    });
  },
};
`;

Deno.test("FunctionAdapter: adds the Lambda handler beside the bundle's main.js, marked as ES modules", () => {
  const files = unzipSync(
    new FunctionAdapter().adapt(
      zipSync({ "main.js": strToU8(ENTRY), "main.js.map": strToU8("") }),
    ),
  );
  assertEquals(Object.keys(files).sort(), [
    "ensemble-lambda.mjs",
    "main.js",
    "main.js.map",
    "package.json",
  ]);
  assertEquals(JSON.parse(strFromU8(files["package.json"]!)), {
    type: "module",
  });
});

Deno.test("FunctionAdapter: keeps the bundle's own package.json", () => {
  const files = unzipSync(
    new FunctionAdapter().adapt(
      zipSync({
        "main.js": strToU8(ENTRY),
        "package.json": strToU8(`{"type":"module","x":1}`),
      }),
    ),
  );
  assertEquals(JSON.parse(strFromU8(files["package.json"]!)), {
    type: "module",
    x: 1,
  });
});

Deno.test("FunctionAdapter: refuses a bundle with no main.js", () => {
  assertThrows(
    () => new FunctionAdapter().adapt(zipSync({ "aws.js": strToU8(ENTRY) })),
    Error,
    "has no main.js",
  );
});

Deno.test("FunctionAdapter: the handler answers API Gateway with what the bundle's fetch returns", async () => {
  const dir = await Deno.makeTempDir({ prefix: "aws-function-adapter-" });
  try {
    const files = unzipSync(
      new FunctionAdapter().adapt(zipSync({ "main.js": strToU8(ENTRY) })),
    );
    for (const [path, bytes] of Object.entries(files)) {
      await Deno.writeFile(join(dir, path), bytes);
    }
    Deno.env.set("GREETING", "hello");
    const { handler } = await import(
      toFileUrl(join(dir, "ensemble-lambda.mjs")).href
    );
    const result = await handler({
      rawPath: "/v1/things",
      rawQueryString: "a=1",
      headers: { host: "api.example" },
      body: btoa("payload"),
      isBase64Encoded: true,
      requestContext: { domainName: "api.example", http: { method: "POST" } },
    });
    assertEquals(result.statusCode, 201);
    assertEquals(result.cookies, ["a=1"]);
    assertEquals(result.isBase64Encoded, false);
    assertEquals(JSON.parse(result.body), {
      url: "https://api.example/v1/things?a=1",
      body: "payload",
      greeting: "hello",
    });
  } finally {
    Deno.env.delete("GREETING");
    await Deno.remove(dir, { recursive: true });
  }
});
