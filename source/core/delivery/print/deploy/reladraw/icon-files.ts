import type { Icon } from "../icons.ts";
import computeContainer from "../../../icons/compute-container.svg" with {
  type: "text",
};
import computeFunction from "../../../icons/compute-function.svg" with {
  type: "text",
};
import databaseKeyValue from "../../../icons/database-key-value.svg" with {
  type: "text",
};
import databaseRelational from "../../../icons/database-relational.svg" with {
  type: "text",
};
import external from "../../../icons/external.svg" with { type: "text" };
import gateway from "../../../icons/gateway.svg" with { type: "text" };
import network from "../../../icons/network.svg" with { type: "text" };
import release from "../../../icons/release.svg" with { type: "text" };
import secret from "../../../icons/secret.svg" with { type: "text" };
import storageObject from "../../../icons/storage-object.svg" with {
  type: "text",
};
import storageVolume from "../../../icons/storage-volume.svg" with {
  type: "text",
};
import task from "../../../icons/task.svg" with { type: "text" };
import unknown from "../../../icons/unknown.svg" with { type: "text" };
import variable from "../../../icons/variable.svg" with { type: "text" };

/** The artwork for each `Icon`, as the SVG the files in `icons/` hold. */
export class IconFiles {
  private static readonly SVG: Readonly<Record<Icon, string>> = {
    "compute-container": computeContainer,
    "compute-function": computeFunction,
    "database-key-value": databaseKeyValue,
    "database-relational": databaseRelational,
    "external": external,
    "gateway": gateway,
    "network": network,
    "release": release,
    "secret": secret,
    "storage-object": storageObject,
    "storage-volume": storageVolume,
    "task": task,
    "unknown": unknown,
    "variable": variable,
  };

  svg(icon: Icon): string {
    return IconFiles.SVG[icon];
  }
}
