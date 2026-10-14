import { assertEquals, assertRejects } from "@std/assert";
import {
  DockerCredentials,
  ImageReference,
  RegistryPushProbe,
} from "./push-authorization.ts";

Deno.test("ImageReference.parse: normalizes references the way docker does", () => {
  const cases: [string, string, string, string][] = [
    ["app", "docker.io", "library/app", "https://registry-1.docker.io"],
    ["team/app", "docker.io", "team/app", "https://registry-1.docker.io"],
    ["ghcr.io/org/app", "ghcr.io", "org/app", "https://ghcr.io"],
    ["ghcr.io/org/app:1.2.3", "ghcr.io", "org/app", "https://ghcr.io"],
    ["localhost:5000/app", "localhost:5000", "app", "http://localhost:5000"],
  ];
  for (const [reference, registry, repository, baseUrl] of cases) {
    const image = ImageReference.parse(reference);
    assertEquals(
      [image.registry, image.repository, image.baseUrl],
      [registry, repository, baseUrl],
      reference,
    );
  }
});

Deno.test("DockerCredentials: a registry's credential helper wins over inline auths", async () => {
  const helperCalls: string[] = [];
  const credentials = new DockerCredentials(
    {
      credHelpers: { "ghcr.io": "gh" },
      auths: { "https://ghcr.io": { auth: btoa("inline:secret") } },
    },
    (helper, key) => {
      helperCalls.push(`${helper} ${key}`);
      return Promise.resolve({ username: "helped", secret: "s" });
    },
  );
  assertEquals(
    await credentials.for(ImageReference.parse("ghcr.io/org/app")),
    { username: "helped", secret: "s" },
  );
  assertEquals(helperCalls, ["gh ghcr.io"]);
});

Deno.test("DockerCredentials: decodes an inline auths entry keyed with a scheme", async () => {
  const credentials = new DockerCredentials({
    auths: { "https://index.docker.io/v1/": { auth: btoa("me:p:w") } },
  });
  assertEquals(
    await credentials.for(ImageReference.parse("team/app")),
    { username: "me", secret: "p:w" },
  );
});

interface Call {
  method: string;
  url: string;
  authorization?: string;
}

/** A registry that challenges anonymous requests with a Bearer realm and only opens an upload session for `grantedToken`. */
function registry(grantedToken: string, issuedToken: string, calls: Call[]) {
  return (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    const method = init.method ?? "GET";
    calls.push({ method, url, authorization: headers.Authorization });
    if (url.startsWith("https://auth.example/token")) {
      return Promise.resolve(Response.json({ token: issuedToken }));
    }
    if (method === "DELETE") {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (!headers.Authorization) {
      return Promise.resolve(
        new Response("", {
          status: 401,
          headers: {
            "www-authenticate":
              'Bearer realm="https://auth.example/token",service="registry.example"',
          },
        }),
      );
    }
    if (headers.Authorization === `Bearer ${grantedToken}`) {
      return Promise.resolve(
        new Response(null, {
          status: 202,
          headers: { location: "/v2/org/app/blobs/uploads/abc" },
        }),
      );
    }
    return Promise.resolve(
      new Response('{"errors":[{"code":"DENIED"}]}', { status: 403 }),
    );
  };
}

Deno.test("RegistryPushProbe: proves push access with a push-scoped token, then cancels the upload", async () => {
  const calls: Call[] = [];
  const image = ImageReference.parse("registry.example/org/app");
  await new RegistryPushProbe(registry("writer", "writer", calls)).require(
    image,
    { username: "me", secret: "pw" },
  );

  assertEquals(calls.map((c) => `${c.method} ${c.url}`), [
    "POST https://registry.example/v2/org/app/blobs/uploads/",
    "GET https://auth.example/token?service=registry.example&scope=repository%3Aorg%2Fapp%3Apush%2Cpull",
    "POST https://registry.example/v2/org/app/blobs/uploads/",
    "DELETE https://registry.example/v2/org/app/blobs/uploads/abc",
  ]);
  assertEquals(calls[1].authorization, `Basic ${btoa("me:pw")}`);
  assertEquals(calls[3].authorization, "Bearer writer");
});

Deno.test("RegistryPushProbe: refuses with the registry's answer when the token isn't granted push", async () => {
  const calls: Call[] = [];
  const image = ImageReference.parse("registry.example/org/app");
  await assertRejects(
    () =>
      new RegistryPushProbe(registry("writer", "reader", calls)).require(
        image,
        { username: "me", secret: "pw" },
      ),
    Error,
    "registry.example refused a push to org/app: HTTP 403",
  );
  assertEquals(calls.some((c) => c.method === "DELETE"), false);
});
