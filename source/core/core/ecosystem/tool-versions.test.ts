import { assertThrows } from "@std/assert";
import { ToolVersions } from "./tool-versions.ts";

Deno.test("ToolVersions: a tool the ecosystem doesn't know is refused", () => {
  assertThrows(
    () => new ToolVersions("cargo", { ruby: "3.0.0" }, ["rust"]),
    Error,
    "names ruby, but this ecosystem only pins: rust",
  );
});

Deno.test("ToolVersions: a matching version, or one a shorter pin covers, is accepted", () => {
  const exact = new ToolVersions("cargo", { rust: "1.90.0" }, ["rust"]);
  exact.refuseUnlessSatisfied("rust", "rustc 1.90.0 (abc 2026-01-01)", "");
  const minor = new ToolVersions("cargo", { rust: "1.90" }, ["rust"]);
  minor.refuseUnlessSatisfied("rust", "rustc 1.90.3 (abc 2026-01-01)", "");
});

Deno.test("ToolVersions: another version is refused, even one sharing the pin's digits", () => {
  const pins = new ToolVersions("cargo", { rust: "1.9" }, ["rust"]);
  assertThrows(
    () => pins.refuseUnlessSatisfied("rust", "rustc 1.90.0", "Install rustup."),
    Error,
    "pins 1.9, but this machine has 1.90.0. Install rustup.",
  );
});

Deno.test("ToolVersions: a channel name has no number to hold a tool to", () => {
  const pins = new ToolVersions("cargo", { rust: "stable" }, ["rust"]);
  pins.refuseUnlessSatisfied("rust", "rustc 1.90.0", "");
});

Deno.test("ToolVersions: a tool with no pin is left alone", () => {
  const pins = new ToolVersions("deno", {}, ["deno"]);
  pins.refuseUnlessSatisfied("deno", "deno 2.0.0", "");
});
