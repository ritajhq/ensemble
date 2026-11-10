import { assertEquals } from "@std/assert";
import { ManifestDiagnostics } from "./diagnostics.ts";

const diagnostics = new ManifestDiagnostics();

Deno.test("ManifestDiagnostics: marks every problem on the key it's about", () => {
  const found = diagnostics.of(`version: v1
deploy:
  compute:
    api:
      type: container
      replica: 1
      image: \${release.web}
`);

  assertEquals(found.map((d) => [d.range.start.line, d.message]), [
    [5, 'compute.container has no param "replica". Did you mean "replicas"?'],
    [3, 'compute.container requires param "replicas".'],
    [6, 'compute.api.image references undeclared release "web".'],
  ]);
  assertEquals(found[0].range.start.character, 6);
  assertEquals(found[0].range.end.character, 13);
});

Deno.test("ManifestDiagnostics: a YAML syntax error is reported alone", () => {
  const found = diagnostics.of("version: v1\ndeploy:\n  compute: [\n");
  assertEquals(found.length > 0, true);
  assertEquals(found.every((d) => d.source === "ens"), true);
});

Deno.test("ManifestDiagnostics: a valid manifest has none", () => {
  assertEquals(diagnostics.of("version: v1\n"), []);
});
