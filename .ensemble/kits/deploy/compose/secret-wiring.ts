import * as KitSdk from "@ensemble/kit-sdk";

/**
 * Compose's native wiring for a `secrets` entry: an env-var interpolation
 * placeholder (`${VAR}`), the var name derived from the secret's own name
 * (Section 8 — compose has no other secret-delivery mechanism this kit uses).
 * Only `source: environment` is supported today; Appendix A's own fixture
 * never exercises `source: file`, so that convention isn't invented here.
 */
export function composeSecretWiring(
  secretName: string,
  secrets: Readonly<Record<string, KitSdk.Deploy.SecretDeclaration>>,
): string {
  const declaration = secrets[secretName];
  if (!declaration) {
    throw new Error(
      `No secret named "${secretName}" is declared in this workload.`,
    );
  }
  if (declaration.source !== "environment") {
    throw new Error(
      `The compose kit only supports environment-sourced secrets today (secret "${secretName}" is "${declaration.source}").`,
    );
  }
  return `\${${environmentVariableName(secretName)}}`;
}

function environmentVariableName(secretName: string): string {
  return secretName.toUpperCase().replace(/-/g, "_");
}
