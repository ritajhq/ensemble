import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { Discovery } from "./discovery.ts";

async function checkout(files: Record<string, string>): Promise<string> {
  const root = await Deno.makeTempDir();
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    await Deno.mkdir(join(full, ".."), { recursive: true });
    await Deno.writeTextFile(full, content);
  }
  return root;
}

const WEB = `version: v1
release:
  web:
    kit: docker
deploy:
  secrets:
    db-password:
      source: environment
    tls-key:
      source: file
  variables:
    domain:
      default: example.com
    ingress_networks:
      type: list
`;

Deno.test("Discovery: reads each manifest's ships, variables and environment secrets, and the deploy kits", async () => {
  const root = await checkout({
    "ci/web/delivery.yml": WEB,
    "ci/scripts-only/run.sh": "echo",
    ".ensemble/kits/deploy/compose/main.ts": "",
    ".ensemble/kits/deploy/aws/main.ts": "",
  });

  const catalog = await Discovery.standard().discover(root, "abc123");

  assertEquals(catalog.commit, "abc123");
  assertEquals(catalog.kits, ["aws", "compose"]);
  assertEquals(catalog.problems, []);
  assertEquals(catalog.manifests.length, 1);
  const [web] = catalog.manifests;
  assertEquals(web.name, "web");
  assertEquals(web.ships, ["web"]);
  assertEquals(web.secrets, ["db-password"]);
  assertEquals(web.variables, [
    { name: "domain", list: false, default: "example.com" },
    { name: "ingress_networks", list: true },
  ]);
});

Deno.test("Discovery: a manifest that doesn't parse is a problem, and never hides the others", async () => {
  const root = await checkout({
    "ci/broken/delivery.yml": "version: v2\n",
    "ci/web/delivery.yml": WEB,
  });

  const catalog = await Discovery.standard().discover(root, "abc123");

  assertEquals(catalog.manifests.map((manifest) => manifest.name), ["web"]);
  assertEquals(catalog.problems.map((problem) => problem.manifest), [
    "broken",
  ]);
});

Deno.test("Discovery: a checkout without manifests or kits offers nothing", async () => {
  const catalog = await Discovery.standard().discover(
    await checkout({}),
    "abc123",
  );
  assertEquals(catalog.manifests, []);
  assertEquals(catalog.kits, []);
});
