import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { EnsembleConfigStore } from "./config.ts";
import { EcosystemList } from "./ecosystem-list.ts";

const CONFIG = `# The project's settings.
ecosystems: # what the project is made of
  - deno # the toolchain
  - cargo

# How apps are built.
build:
  cli:
    kit: deno.bundle # bundled
`;

Deno.test("EcosystemList: adding an ecosystem keeps every comment and the lines of those that stay", () => {
  assertEquals(
    new EcosystemList(CONFIG).replacedWith(["deno", "cargo", "python"]),
    CONFIG.replace("  - cargo\n", "  - cargo\n  - python\n"),
  );
});

Deno.test("EcosystemList: dropping one removes only its line", () => {
  assertEquals(
    new EcosystemList(CONFIG).replacedWith(["deno"]),
    CONFIG.replace("  - cargo\n", ""),
  );
});

Deno.test("EcosystemList: a file with no entry gets one at the end", () => {
  assertEquals(
    new EcosystemList("# mine\nbuild: {}").replacedWith(["deno"]),
    "# mine\nbuild: {}\necosystems:\n  - deno\n",
  );
  assertEquals(
    new EcosystemList("").replacedWith(["deno"]),
    "ecosystems:\n  - deno\n",
  );
});

Deno.test("EcosystemList: an entry listed flush with its key stays that way", () => {
  assertEquals(
    new EcosystemList("ecosystems:\n- deno\nbuild: {}\n").replacedWith([
      "deno",
      "cargo",
    ]),
    "ecosystems:\n- deno\n- cargo\nbuild: {}\n",
  );
});

Deno.test("EnsembleConfigStore.setEcosystems: rewrites the file without losing its comments", async () => {
  const root = await Deno.makeTempDir({ prefix: "config-test-" });
  await Deno.mkdir(join(root, ".ensemble"));
  const path = join(root, ".ensemble", "config.yaml");
  await Deno.writeTextFile(path, CONFIG);

  await new EnsembleConfigStore(root).setEcosystems(["deno", "cargo", "go"]);

  assertEquals(
    await Deno.readTextFile(path),
    CONFIG.replace("  - cargo\n", "  - cargo\n  - go\n"),
  );
});

Deno.test("EnsembleConfigStore.setEcosystems: an entry it can't follow is rewritten from the parsed file", async () => {
  const root = await Deno.makeTempDir({ prefix: "config-test-" });
  await Deno.mkdir(join(root, ".ensemble"));
  const path = join(root, ".ensemble", "config.yaml");
  await Deno.writeTextFile(path, "ecosystems: [deno,\n  cargo]\nbuild: {}\n");

  await new EnsembleConfigStore(root).setEcosystems(["deno", "go"]);

  const store = new EnsembleConfigStore(root);
  assertEquals((await store.load()).ecosystems, ["deno", "go"]);
  assertEquals(Object.keys(await store.load()), ["ecosystems", "build"]);
});

Deno.test("EnsembleConfigStore.setEcosystems: a file written as a flow mapping is rewritten from the parsed file", async () => {
  const root = await Deno.makeTempDir({ prefix: "config-test-" });
  await Deno.mkdir(join(root, ".ensemble"));
  await Deno.writeTextFile(join(root, ".ensemble", "config.yaml"), "{}\n");

  const store = new EnsembleConfigStore(root);
  await store.setEcosystems(["deno", "cargo"]);

  assertEquals((await store.load()).ecosystems, ["deno", "cargo"]);
});
