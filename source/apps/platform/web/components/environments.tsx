import { useState } from "react";
import {
  Badge,
  Button,
  InputField,
  InputGroup,
  TabItem,
  TabPanel,
  Tabs,
  TabsList,
  useIcon,
} from "@ritaj/ui";
import {
  describe,
  type Environment,
  type EnvironmentPath,
  type Manifest,
  type ValueKind,
} from "../api.ts";
import { useApi } from "../api-provider.tsx";
import { Notice } from "./notice.tsx";

/** One value a manifest declares, as an environment answers it. */
interface Declared {
  readonly kind: ValueKind;
  readonly name: string;
  /** For a variable: what it takes when nothing is set. */
  readonly fallback?: string;
  readonly list?: boolean;
}

/** Every value `manifest` declares, variables first. */
function declaredIn(manifest: Manifest): Declared[] {
  return [
    ...manifest.variables.map((variable) => ({
      kind: "variables" as const,
      name: variable.name,
      fallback: variable.default,
      list: variable.list,
    })),
    ...manifest.secrets.map((secret) => ({
      kind: "secrets" as const,
      name: secret,
    })),
  ];
}

/** How each kind of value reads in the table. */
const KIND_LABELS: Readonly<Record<ValueKind, (declared: Declared) => string>> =
  {
    variables: (declared) => declared.list ? "list variable" : "variable",
    secrets: () => "secret",
  };

/** A manifest's environments, one tab each, with what each supplies and a way to add another. */
export function Environments(
  { project, manifest, onChanged }: {
    project: string;
    manifest: Manifest;
    onChanged(): void;
  },
) {
  const [selected, setSelected] = useState(manifest.environments[0]?.name);

  return (
    <div className="grid gap-3">
      <Tabs value={selected} onValueChange={setSelected}>
        <TabsList>
          {manifest.environments.map((environment) => (
            <TabItem
              key={environment.id}
              value={environment.name}
              label={environment.missing.length === 0
                ? environment.name
                : `${environment.name} · ${environment.missing.length} missing`}
            />
          ))}
        </TabsList>
        {manifest.environments.map((environment) => (
          <TabPanel
            key={environment.id}
            value={environment.name}
            className="pt-3"
          >
            <EnvironmentValues
              at={{
                project,
                manifest: manifest.name,
                environment: environment.name,
              }}
              declared={declaredIn(manifest)}
              environment={environment}
              onChanged={onChanged}
            />
          </TabPanel>
        ))}
      </Tabs>
      <AddEnvironment
        project={project}
        manifest={manifest.name}
        onAdded={(name) => {
          setSelected(name);
          onChanged();
        }}
      />
    </div>
  );
}

function EnvironmentValues(
  { at, declared, environment, onChanged }: {
    at: EnvironmentPath;
    declared: readonly Declared[];
    environment: Environment;
    onChanged(): void;
  },
) {
  if (declared.length === 0) {
    return (
      <p className="text-body text-muted-foreground">
        This manifest declares no variables or secrets.
      </p>
    );
  }
  return (
    <div className="grid gap-2">
      {declared.map((value) => (
        <ValueRow
          key={`${value.kind}-${value.name}`}
          at={at}
          declared={value}
          environment={environment}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

/** What a declared value currently reads as in an environment, for its input's placeholder. */
const CURRENT: Readonly<
  Record<ValueKind, (declared: Declared, environment: Environment) => string>
> = {
  variables: (declared) =>
    declared.fallback === undefined
      ? "not set"
      : `not set: defaults to ${declared.fallback}`,
  secrets: (declared, environment) =>
    environment.secrets.includes(declared.name)
      ? "set: type to replace it"
      : "not set",
};

function ValueRow(
  { at, declared, environment, onChanged }: {
    at: EnvironmentPath;
    declared: Declared;
    environment: Environment;
    onChanged(): void;
  },
) {
  const api = useApi();
  const stored = declared.kind === "variables"
    ? environment.variables[declared.name]
    : undefined;
  const isSet = stored !== undefined ||
    environment.secrets.includes(declared.name);
  const [draft, setDraft] = useState(stored ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const missing = environment.missing.includes(declared.name);

  async function act(change: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await change();
      onChanged();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  const changed = declared.kind === "secrets"
    ? draft !== ""
    : draft !== (stored ?? "");

  return (
    <div className="grid gap-1">
      <form
        className="grid grid-cols-1 items-center gap-2 md:grid-cols-[minmax(10rem,14rem)_auto_1fr_auto_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          act(async () => {
            await api.setValue(at, declared.kind, declared.name, draft);
            if (declared.kind === "secrets") setDraft("");
          });
        }}
      >
        <span className="truncate font-mono text-caption">
          {declared.name}
        </span>
        <span className="flex gap-1">
          <Badge color={declared.kind === "secrets" ? "amber" : "gray"}>
            {KIND_LABELS[declared.kind](declared)}
          </Badge>
          {missing && <Badge color="red">missing</Badge>}
        </span>
        <InputGroup className="min-w-0">
          <InputField
            index={0}
            label={declared.name}
            labelHidden
            type={declared.kind === "secrets" ? "password" : "text"}
            autoComplete="off"
            placeholder={stored === undefined
              ? CURRENT[declared.kind](declared, environment)
              : ""}
            value={draft}
            onChange={setDraft}
          />
        </InputGroup>
        <Button
          type="submit"
          variant="secondary"
          disabled={busy || !changed}
        >
          Save
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy || !isSet}
          onClick={() =>
            act(async () => {
              await api.unsetValue(at, declared.kind, declared.name);
              setDraft("");
            })}
        >
          Clear
        </Button>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

function AddEnvironment(
  { project, manifest, onAdded }: {
    project: string;
    manifest: string;
    onAdded(name: string): void;
  },
) {
  const api = useApi();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const AddIcon = useIcon("plus");

  return (
    <div className="grid gap-2">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            const added = await api.addEnvironment(
              project,
              manifest,
              name.trim(),
            );
            setName("");
            onAdded(added.name);
          } catch (e) {
            setError(describe(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <InputGroup className="min-w-0 max-w-xs flex-1">
          <InputField
            index={0}
            label="New environment"
            labelHidden
            placeholder="staging"
            value={name}
            onChange={setName}
          />
        </InputGroup>
        <Button
          type="submit"
          variant="secondary"
          leadingIcon={AddIcon}
          loading={busy}
          disabled={busy || !name.trim()}
        >
          Add environment
        </Button>
      </form>
      <p className="text-caption text-muted-foreground">
        An environment's name can't be changed later: its deployments are named
        after it.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
