import { join } from "@std/path";
import { assertEquals } from "@std/assert";
import { ReferencedPacks } from "./referenced-packs.ts";

async function shipWith(dockerfile: string): Promise<string> {
  const ship = await Deno.makeTempDir({ prefix: "docker-kit-ship-" });
  await Deno.writeTextFile(join(ship, "Dockerfile"), dockerfile);
  return ship;
}

Deno.test("ReferencedPacks.read: a pack copied from is reported under its own output name", async () => {
  const ship = await shipWith(
    `FROM hot-server:latest\nCOPY --from=pack/dhikr/pwa . /app/www\n`,
  );
  try {
    assertEquals(await ReferencedPacks.read(ship), [
      { ship: "dhikr", kit: "pwa", outputName: "dhikr.pwa" },
    ]);
  } finally {
    await Deno.remove(ship, { recursive: true });
  }
});

Deno.test("ReferencedPacks.read: a ship named with a slash keeps it, the kit being the last part", async () => {
  const ship = await shipWith(
    `COPY --from=pack/admin/client/pwa . /app/www\n`,
  );
  try {
    assertEquals(await ReferencedPacks.read(ship), [
      { ship: "admin/client", kit: "pwa", outputName: "admin/client.pwa" },
    ]);
  } finally {
    await Deno.remove(ship, { recursive: true });
  }
});

Deno.test("ReferencedPacks.read: a pack copied twice is reported once, and apps and other stages are not packs", async () => {
  const ship = await shipWith(
    [
      "FROM alpine AS build",
      "COPY --from=admin/client . /a",
      "COPY --from=build /x /y",
      "COPY --from=pack/site/pwa . /b",
      "COPY --from=pack/site/pwa icons/ /c",
      "",
    ].join("\n"),
  );
  try {
    assertEquals(await ReferencedPacks.read(ship), [
      { ship: "site", kit: "pwa", outputName: "site.pwa" },
    ]);
  } finally {
    await Deno.remove(ship, { recursive: true });
  }
});

Deno.test("ReferencedPacks.read: a Dockerfile copying from no pack reports none", async () => {
  const ship = await shipWith(`FROM scratch\nCOPY --from=app . /x\n`);
  try {
    assertEquals(await ReferencedPacks.read(ship), []);
  } finally {
    await Deno.remove(ship, { recursive: true });
  }
});
