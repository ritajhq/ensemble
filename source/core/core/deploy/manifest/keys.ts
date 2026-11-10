/** A key a manifest mapping may hold, and whether it must. */
export interface Key {
  readonly name: string;
  readonly required: boolean;
}

function optional(name: string): Key {
  return { name, required: false };
}

function required(name: string): Key {
  return { name, required: true };
}

/**
 * The keys of every mapping in a manifest whose keys are fixed, rather than
 * names the developer chooses. The parser rejects anything else; an editor
 * suggests these. A resource's own fields aren't here: its contract owns them.
 */
export const KEYS = {
  envelope: [
    required("version"),
    optional("release"),
    optional("deploy"),
    optional("tasks"),
    optional("launch"),
  ],
  release: [
    required("kit"),
    optional("mode"),
    optional("outputName"),
    optional("publish"),
  ],
  publish: [required("target"), optional("name"), optional("options")],
  secret: [required("source"), optional("description")],
  variable: [optional("type"), optional("default"), optional("description")],
  external: [required("type"), required("name")],
  resource: [required("type"), optional("class"), optional("capabilities")],
  task: [optional("run"), optional("script"), optional("arguments")],
  launch: [
    required("type"),
    optional("command"),
    optional("package"),
    optional("ports"),
    optional("env"),
    optional("envSecrets"),
    optional("development"),
  ],
  launchDevelopment: [optional("restart")],
} as const satisfies Record<string, readonly Key[]>;

/** The `version:` values this `ens` reads. */
export const SUPPORTED_VERSIONS = ["v1"] as const;

/** Where a secret's value comes from. */
export const SECRET_SOURCES = ["environment", "file"] as const;

export function namesOf(keys: readonly Key[]): string[] {
  return keys.map((key) => key.name);
}
