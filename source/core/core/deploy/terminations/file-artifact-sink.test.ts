import { join } from "@std/path";
import { assertEquals } from "@std/assert";
import { FileArtifactSink } from "./file-artifact-sink.ts";

Deno.test("FileArtifactSink.write: creates the directory and writes the artifact's content under its filename", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const sink = new FileArtifactSink(join(dir, "nested", "outputs"));
    const artifact = { filename: "compose.yaml", content: "services: {}\n" };

    await sink.write(artifact);

    const path = sink.pathFor(artifact);
    assertEquals(path, join(dir, "nested", "outputs", "compose.yaml"));
    assertEquals(await Deno.readTextFile(path), "services: {}\n");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("FileArtifactSink.write: overwrites a previously written artifact", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const sink = new FileArtifactSink(dir);
    await sink.write({ filename: "compose.yaml", content: "first" });
    await sink.write({ filename: "compose.yaml", content: "second" });

    assertEquals(await Deno.readTextFile(join(dir, "compose.yaml")), "second");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
