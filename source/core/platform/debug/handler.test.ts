import { assertEquals } from "@std/assert";
import { createHandleDebugInfo } from "./handler.ts";

Deno.test("handleDebugInfo: reports ENSEMBLE_IMAGE_TAG and the given mounted feature names", async () => {
  const previous = Deno.env.get("ENSEMBLE_IMAGE_TAG");
  Deno.env.set("ENSEMBLE_IMAGE_TAG", "0.0.7");
  try {
    const handle = createHandleDebugInfo(["workflow-registry", "dashboard"]);
    const response = handle();
    assertEquals(response.status, 200);
    assertEquals(await response.json(), {
      imageTag: "0.0.7",
      mountedFeatures: ["workflow-registry", "dashboard"],
    });
  } finally {
    if (previous === undefined) Deno.env.delete("ENSEMBLE_IMAGE_TAG");
    else Deno.env.set("ENSEMBLE_IMAGE_TAG", previous);
  }
});

Deno.test("handleDebugInfo: imageTag falls back to 'unknown' when ENSEMBLE_IMAGE_TAG is unset", async () => {
  const previous = Deno.env.get("ENSEMBLE_IMAGE_TAG");
  Deno.env.delete("ENSEMBLE_IMAGE_TAG");
  try {
    const handle = createHandleDebugInfo([]);
    const response = handle();
    assertEquals((await response.json()).imageTag, "unknown");
  } finally {
    if (previous !== undefined) Deno.env.set("ENSEMBLE_IMAGE_TAG", previous);
  }
});
