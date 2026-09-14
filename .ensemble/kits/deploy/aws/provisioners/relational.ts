import * as KitSdk from "@ensemble/kit-sdk";
import { pascalCase } from "../pascal-case.ts";
import { getAtt, ref, sub } from "../cfn.ts";

const POSTGRES_PORT = 5432;

/**
 * Fulfills `relational` on aws as `AWS::RDS::DBInstance`. The password never
 * appears as a literal anywhere (G4 — ens doesn't mint secrets, only wires
 * them): the secret name becomes a `NoEcho` template Parameter, referenced
 * via `!Ref` wherever the password is needed, including inside the `url`
 * output's own `!Sub`. `host` is the RDS endpoint — provider-allocated, so
 * it's `!GetAtt`, never guessed (G3, this whole worked example's point).
 * `class` expands through the negotiated concern values into real RDS
 * properties (`BackupRetentionPeriod`/`MultiAZ`/`DeletionProtection`/
 * `AllocatedStorage`) — unlike compose, where those concerns had nothing to
 * render into.
 */
/** How many read replicas to create — the "read-replicas" quantified capability's resolved value, satisfied only on aws (Section 11: undeclared support defaults to unsatisfied, so this provisioner only ever sees the value when `ProvisionerSelector` already found it satisfiable here). Absent entirely (not just zero) when the developer didn't ask for any. */
function readReplicaCount(request: KitSdk.Deploy.ResolvedRequest): number {
  const value = request.values["read-replicas"]?.value;
  return typeof value === "number" ? value : 0;
}

/** Each read replica: a real, minimal `AWS::RDS::DBInstance` whose only defining property is `SourceDBInstanceIdentifier` — RDS inherits engine/credentials from the source instance it replicates (real RDS semantics, not a stand-in). */
function readReplicaResources(
  logicalId: string,
  count: number,
): Record<string, unknown> {
  const resources: Record<string, unknown> = {};
  for (let i = 1; i <= count; i++) {
    resources[`${logicalId}Replica${i}`] = {
      Type: "AWS::RDS::DBInstance",
      Properties: { SourceDBInstanceIdentifier: ref(logicalId) },
    };
  }
  return resources;
}

export function relationalProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    matches: (resource) => resource.declaration.type === "relational",
    describe: () => "relational (AWS::RDS::DBInstance)",
    provision: (request) => {
      const logicalId = pascalCase(request.name);
      const secretParamName = pascalCase(String(request.params.passwordSecret));

      // `ref`/`getAtt` are called fresh at each use site (never a shared
      // variable reused across positions) so the YAML serializer never sees
      // the same object twice and never anchors/aliases it (`&x`/`*x`) — CFN's
      // own YAML parser has a history of shaky anchor support, and Appendix
      // A's golden repeats `!Ref`/`!GetAtt` literally rather than aliasing.
      return {
        fragment: {
          category: request.category,
          name: request.name,
          content: {
            resources: {
              [logicalId]: {
                Type: "AWS::RDS::DBInstance",
                Properties: {
                  Engine: request.params.engine,
                  EngineVersion: request.params.version,
                  MasterUsername: request.params.user,
                  MasterUserPassword: ref(secretParamName),
                  DBName: request.params.database,
                  AllocatedStorage: request.values.storageSize?.value,
                  BackupRetentionPeriod: request.values.backupRetention?.value,
                  MultiAZ: request.values.multiAz?.value,
                  DeletionProtection: request.values.deletionProtection?.value,
                },
              },
              ...readReplicaResources(logicalId, readReplicaCount(request)),
            },
            parameters: {
              [secretParamName]: { Type: "String", NoEcho: true },
            },
          },
        },
        outputs: {
          host: getAtt(logicalId, "Endpoint.Address"),
          port: POSTGRES_PORT,
          user: request.params.user,
          database: request.params.database,
          url: sub(
            `postgres://${request.params.user}:\${Pw}@\${Host}:${POSTGRES_PORT}/${request.params.database}`,
            {
              Host: getAtt(logicalId, "Endpoint.Address"),
              Pw: ref(secretParamName),
            },
          ),
        },
      };
    },
  };
}
