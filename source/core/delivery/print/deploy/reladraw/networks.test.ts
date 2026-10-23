import { assertEquals, assertStringIncludes } from "@std/assert";
import { Deploy } from "@ensemble/core";
import { Mapper } from "../mapper.ts";
import { Diagrammer } from "./diagram.ts";
import { Source } from "./source.ts";

const MANIFEST = `
version: v1
deploy:
  compute:
    api:
      type: container
      image: api
      replicas: 1
      networks:
        - \${external.inner.name}
        - \${external.outer.name}
    router:
      type: container
      image: router
      replicas: 1
      networks:
        - \${external.outer.name}
    worker:
      type: container
      image: worker
      replicas: 1
      networks:
        - \${external.inner.name}
        - \${external.outer.name}
  external:
    outer:
      type: network
      name: outer
    inner:
      type: network
      name: inner
    vpc:
      type: vpc
      name: shared
`;

const architecture = () =>
  new Mapper().map(new Deploy.Manifest.Parser().parse(MANIFEST));

const regions = () =>
  new Source().write(architecture()).split("\n")
    .filter((line) => line.startsWith("region "));

Deno.test("networks: each network with a compute is an area, an external of another type stays a node", () => {
  const source = new Source().write(architecture());
  assertEquals(regions().length, 2);
  assertStringIncludes(source, "vpc");
  assertEquals(source.includes('inner network"'), true);
});

Deno.test("networks: an area holding another is wider than it, so their borders don't run together", () => {
  const padding = (name: string) =>
    Number(
      regions().find((line) => line.includes(`${name} network"`))!
        .match(/padding: (\d+)/)![1],
    );
  assertEquals(padding("outer") > padding("inner"), true);
});

Deno.test("networks: computes on the same networks are drawn next to each other", () => {
  const source = new Source().write(architecture());
  const order = ["api", "router", "worker"].map((name) =>
    source.indexOf(`"${name}"`)
  );
  // api and worker share both networks, so the router comes after them.
  assertEquals(order[0] < order[2] && order[2] < order[1], true);
});

Deno.test("networks: the drawing holds together with overlapping areas", () => {
  assertStringIncludes(new Diagrammer().draw(architecture()).svg, "<svg");
});
