import { assertEquals, assertRejects } from "@std/assert";
import { authorizeLibrary, ScopeMembership } from "./authorize-library.ts";

const CONTEXT = {
  libRoot: "/unused",
  package: "@ensemble/core",
  version: "1.2.3",
};

function answering(status: number, calls: string[] = []) {
  return (url: string, init: RequestInit) => {
    calls.push(
      `${url} ${(init.headers as Record<string, string>).Authorization}`,
    );
    return Promise.resolve(new Response("", { status }));
  };
}

async function withToken(
  token: string | undefined,
  run: () => Promise<void>,
): Promise<void> {
  const previous = Deno.env.get("JSR_TOKEN");
  if (token === undefined) Deno.env.delete("JSR_TOKEN");
  else Deno.env.set("JSR_TOKEN", token);
  try {
    await run();
  } finally {
    if (previous === undefined) Deno.env.delete("JSR_TOKEN");
    else Deno.env.set("JSR_TOKEN", previous);
  }
}

Deno.test("authorizeLibrary: refuses without JSR_TOKEN, before asking JSR anything", async () => {
  const calls: string[] = [];
  await withToken(undefined, async () => {
    await assertRejects(
      () =>
        authorizeLibrary(
          CONTEXT,
          (token) => new ScopeMembership(token, answering(200, calls)),
        ),
      Error,
      "JSR_TOKEN isn't set",
    );
  });
  assertEquals(calls, []);
});

Deno.test("authorizeLibrary: grants when the token's account is a member of the package's scope", async () => {
  const calls: string[] = [];
  await withToken("secret", async () => {
    await authorizeLibrary(
      CONTEXT,
      (token) => new ScopeMembership(token, answering(200, calls)),
    );
  });
  assertEquals(calls, [
    "https://api.jsr.io/user/member/ensemble Bearer secret",
  ]);
});

Deno.test("authorizeLibrary: refuses with the reason when the account isn't a scope member", async () => {
  await withToken("secret", async () => {
    await assertRejects(
      () =>
        authorizeLibrary(
          CONTEXT,
          (token) => new ScopeMembership(token, answering(404)),
        ),
      Error,
      "isn't a member of scope @ensemble",
    );
  });
});

Deno.test("authorizeLibrary: refuses an invalid or expired token", async () => {
  await withToken("secret", async () => {
    await assertRejects(
      () =>
        authorizeLibrary(
          CONTEXT,
          (token) => new ScopeMembership(token, answering(401)),
        ),
      Error,
      "invalid or expired",
    );
  });
});
