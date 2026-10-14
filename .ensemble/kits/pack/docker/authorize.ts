import * as KitSdk from "@ensemble/kit-sdk";
import {
  DockerCredentials,
  ImageReference,
  RegistryPushProbe,
} from "./push-authorization.ts";

// publish.ts pushes to packageName — the full image reference from the
// release's `publish.name` — with whatever credentials docker already holds,
// so that's exactly what gets probed here: a real push permission check
// against that repository, with docker's own credentials, that uploads
// nothing.
await KitSdk.Pack.authorizePublish(async (ctx) => {
  const image = ImageReference.parse(ctx.packageName);
  const credentials = await (await DockerCredentials.load()).for(image);
  await new RegistryPushProbe().require(image, credentials);
});
