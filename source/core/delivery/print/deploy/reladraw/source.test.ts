import { assertEquals, assertStringIncludes } from "@std/assert";
import { Deploy } from "@ensemble/core";
import { Mapper } from "../mapper.ts";
import { shopArchitecture } from "../shop-architecture.ts";
import { Diagrammer } from "./diagram.ts";
import { Source } from "./source.ts";
import { Theme } from "./theme.ts";

const lines = (source: string, keyword: string) =>
  source.split("\n").filter((line) => line.startsWith(`${keyword} `));

const CALLS = `
version: v1
deploy:
  compute:
    front:
      type: container
      image: front
      replicas: 1
      ports:
        http: 80
      networks:
        - \${external.net.name}
      env:
        BACK: http://\${compute.back.host}:\${compute.back.http}
        PEER: http://\${compute.peer.host}:\${compute.peer.http}
        LEAF: http://\${compute.leaf.host}:\${compute.leaf.http}
    peer:
      type: container
      image: peer
      replicas: 1
      ports:
        http: 81
      networks:
        - \${external.net.name}
      env:
        FRONT: http://\${compute.front.host}:\${compute.front.http}
    back:
      type: container
      image: back
      replicas: 1
      ports:
        http: 82
      networks:
        - \${external.net.name}
      env:
        LEAF: http://\${compute.leaf.host}:\${compute.leaf.http}
    leaf:
      type: container
      image: leaf
      replicas: 1
      ports:
        http: 83
      networks:
        - \${external.net.name}
  external:
    net:
      type: network
      name: net
`;

const callsArchitecture = () =>
  new Mapper().map(new Deploy.Manifest.Parser().parse(CALLS));

const shop = () => new Source().write(shopArchitecture());

Deno.test("source: a line from a compute to the storage it uses, in the compute's color", () => {
  const edges = lines(shop(), "edge");
  assertEquals(edges.length, 1);
  assertStringIncludes(edges[0], "style: compute_0");
});

Deno.test("source: lines turn at right angles, each at a height of its own", () => {
  assertStringIncludes(shop(), "default edge  line: (path: square)");
  assertStringIncludes(lines(shop(), "edge")[0], "turn: 0.280");
});

Deno.test("source: a network is an area around the computes on it, not a node or a line", () => {
  const source = shop();
  const [region] = lines(source, "region");
  assertStringIncludes(region, 'edge network"');
  assertEquals(source.includes("icon external"), false);
  assertEquals(
    lines(source, "edge").some((edge) => edge.includes("external")),
    false,
  );
});

Deno.test("source: variables and secrets are not drawn, nor any line to them", () => {
  const source = shop();
  for (const absent of ["db-password", "variable", "secret"]) {
    assertEquals(source.includes(absent), false, absent);
  }
});

Deno.test("source: declares only the icons it uses", () => {
  const declared = lines(shop(), "icon").map((line) => line.split(" ")[1]);
  assertEquals(declared, ["compute-container", "network", "storage-volume"]);
});

Deno.test("source: computes stand straight in their row, with no titled group", () => {
  assertEquals(
    lines(shop(), "node").some((line) => line.includes('"compute"')),
    false,
  );
});

Deno.test("source: escapes what reladraw reads as syntax in a text", () => {
  assertStringIncludes(shop(), 'command: run \\"x\\" \\/ \\[y]');
});

Deno.test("source: the computes are above what they use", () => {
  const rows = lines(shop(), "node")
    .filter((line) => /^node arch\.r\d+ /.test(line))
    .map((line) => line.split(" ")[1]);
  assertEquals(rows, ["arch.r1", "arch.r0"]);
});

Deno.test("diagrammer: draws an svg, a line whose ends are level without its turn", () => {
  const level = {
    write: (_: unknown, straight: ReadonlySet<string> = new Set()) =>
      [
        'node a "a"',
        'node b "b"  right of a',
        `edge a -> b  from: right  to: left  line: (path: square${
          straight.has("a -> b") ? "" : ", turn: 0.500"
        })`,
      ].join("\n"),
  } as unknown as Source;
  const diagram = new Diagrammer(level).draw(shopArchitecture());
  assertStringIncludes(diagram.svg, "<svg");
  assertEquals(diagram.source.includes("turn:"), false);
});

Deno.test("source: computes that call each other stand in rows, the caller above, and peers side by side", () => {
  const source = new Source().write(callsArchitecture());
  const rowOf = (name: string) =>
    source.split("\n").find((line) => line.includes(`"${name}" (size`))!
      .match(/node arch\.r(\d+)\./)![1];
  assertEquals(rowOf("front"), rowOf("peer"));
  assertEquals(Number(rowOf("front")) > Number(rowOf("back")), true);
  assertEquals(Number(rowOf("back")) > Number(rowOf("leaf")), true);
  assertStringIncludes(source, "<->");
  assertStringIncludes(source, "from: right  to: left");
});

Deno.test("source: a network is a rectangle between two corners, as its computes stand in several rows", () => {
  const source = new Source().write(callsArchitecture());
  assertStringIncludes(source, "guide point network_0_start");
  assertStringIncludes(source, "network_0_start to network_0_end");
  assertEquals(
    new Diagrammer().draw(callsArchitecture()).svg.includes("<svg"),
    true,
  );
});

Deno.test("source: a line past a row goes down a lane every row begins with, and through points above the rows, not across their boxes", () => {
  const source = new Source().write(callsArchitecture());
  const edge = lines(source, "edge").find((line) =>
    line.includes("via: lane0_")
  )!;
  assertStringIncludes(edge, "from: bottom  to: top");
  assertEquals(lines(source, "guide").length >= 3, true);
  const strips = lines(source, "node").filter((line) =>
    /^node arch\.r\d+\.strip /.test(line)
  );
  assertEquals(strips.length, 3);
});

Deno.test("source: with no line past a row there are no lanes", () => {
  assertEquals(new Source().write(shopArchitecture()).includes("strip"), false);
});

Deno.test("source: each compute has a color of its own, its box and every line it uses others by", () => {
  const source = new Source().write(callsArchitecture());
  const styles = lines(source, "style").filter((line) =>
    line.startsWith("style compute_")
  );
  assertEquals(styles.length, 4);
  const front = lines(source, "node").find((line) =>
    /^node arch\.r\d+\.e\d+ /.test(line) && line.includes("style: compute_0")
  );
  assertEquals(front !== undefined, true);
  assertEquals(
    lines(source, "edge").filter((line) => line.includes("style: compute_0"))
      .length,
    3,
  );
});

Deno.test("source: a light page gets the light theme and colors of its own, a dark one the dark", () => {
  const dark = new Source().write(shopArchitecture());
  const light = new Source().write(
    shopArchitecture(),
    new Set(),
    Theme.light,
  );
  assertStringIncludes(dark, "diagram  theme: dark");
  assertStringIncludes(light, "diagram  theme: light");
  assertStringIncludes(dark, "style compute_0  border: #e06c75");
  assertStringIncludes(light, "style compute_0  border: #d1495b");
  assertEquals(
    new Diagrammer().draw(shopArchitecture(), Theme.light).svg.includes("<svg"),
    true,
  );
});
