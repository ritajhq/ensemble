import { Deploy } from "@ensemble/core";
import { Mapper } from "./mapper.ts";

const MANIFEST = `
version: v1
release:
  api:
    kit: docker
deploy:
  compute:
    api:
      type: container
      image: \${release.api}
      command: 'run "x" / [y]'
      env:
        REGION: \${variables.region.value}
      envSecrets:
        DB_PASSWORD: db-password
      networks:
        - \${external.edge.name}
      mounts:
        - source: \${storage.data.name}
          path: /data
  storage:
    data:
      type: volume
  secrets:
    db-password:
      source: environment
      description: Admin login / for "the" [db]
  variables:
    region:
      default: us-east-1
  external:
    edge:
      type: network
      name: edge
`;

/** The architecture the renderers' tests draw: one compute using a volume, a secret, a variable and an external. */
export function shopArchitecture() {
  return new Mapper().map(new Deploy.Manifest.Parser().parse(MANIFEST));
}
