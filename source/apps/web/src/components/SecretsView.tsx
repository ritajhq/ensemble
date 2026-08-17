import { KeyRound, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import {
  deleteSecret,
  fetchSecretsContext,
  fetchWorkflows,
  type SecretKeySummary,
  setSecret,
} from "../lib/api.ts";
import {
  Button,
  Card,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@ritaj/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ritaj/ui/components/ui/table";

function ContextPicker(
  { value, onChange, knownContexts }: {
    value: string;
    onChange: (value: string) => void;
    knownContexts: string[];
  },
) {
  if (knownContexts.length === 0) {
    return (
      <Input
        placeholder="production"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-xs"
      />
    );
  }

  return (
    <Select
      value={value || undefined}
      onValueChange={(next) => onChange(next ?? "")}
    >
      <SelectTrigger className="w-full max-w-xs">
        <SelectValue placeholder="Choose a context…" />
      </SelectTrigger>
      <SelectContent>
        {knownContexts.map((name) => (
          <SelectItem key={name} value={name}>{name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AddSecretForm(
  { onAdded }: { onAdded: (key: string, value: string) => Promise<void> },
) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<
    { state: "idle" } | { state: "loading" } | {
      state: "error";
      message: string;
    }
  >({
    state: "idle",
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ state: "loading" });
    try {
      await onAdded(key.trim(), value);
      setKey("");
      setValue("");
      setStatus({ state: "idle" });
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <form className="flex flex-col gap-3 p-4 pt-0" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="secret-key">
          Name
        </label>
        <Input
          id="secret-key"
          placeholder="PGPASSWORD"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="secret-value">
          Value
        </label>
        <Input
          id="secret-value"
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          required
        />
      </div>
      <div>
        <Button
          type="submit"
          disabled={status.state === "loading" || key.trim().length === 0}
        >
          {status.state === "loading" ? "Committing…" : "Save"}
        </Button>
      </div>
      {status.state === "error" && (
        <p className="text-sm text-destructive">{status.message}</p>
      )}
    </form>
  );
}

function SecretsTable(
  { keys, onDelete }: {
    keys: SecretKeySummary[];
    onDelete: (key: string) => Promise<void>;
  },
) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(key: string) {
    setPending(key);
    setError(null);
    try {
      await onDelete(key);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : String(deleteError),
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={2}
                  className="text-center text-muted-foreground"
                >
                  No secrets set.
                </TableCell>
              </TableRow>
            )}
            {keys.map(({ key }) => (
              <TableRow key={key}>
                <TableCell className="font-medium font-mono">{key}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={pending === key}
                    onClick={() => handleDelete(key)}
                  >
                    <Trash2 className="size-3.5" />
                    <span className="sr-only">Delete secret</span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/**
 * Adds, replaces, or removes one context's secrets for a git-linked
 * workflow — committing the change directly to that workflow's linked repo
 * (see @ensemble/core's git-write.ts). Values are never fetched for display:
 * the API only ever returns key names, matching GitIntegrationView's
 * principle of never round-tripping a stored secret. A workflow with no
 * linked git repository has no working editor here (the server 404s with a
 * clear message) — its secrets are edited locally via
 * `ens workflow secrets edit` instead, same file format either way.
 */
export function SecretsView() {
  const { workflowId = "" } = useParams();
  const [knownContexts, setKnownContexts] = useState<string[]>([]);
  const [contextName, setContextName] = useState("");
  const [keys, setKeys] = useState<SecretKeySummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    fetchWorkflows()
      .then((workflows) => {
        const workflow = workflows.find((w) => w.id === workflowId);
        const contexts = workflow?.contexts ?? [];
        setKnownContexts(contexts);
        if (contexts.length > 0 && !contextName) setContextName(contexts[0]);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  function refetchKeys() {
    const trimmed = contextName.trim();
    if (!trimmed) {
      setKeys(null);
      return;
    }
    fetchSecretsContext(workflowId, trimmed)
      .then((result) => {
        setKeys(result);
        setLoadError(null);
      })
      .catch((error) => {
        setKeys(null);
        setLoadError(error instanceof Error ? error.message : String(error));
      });
  }

  useEffect(() => {
    refetchKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, contextName]);

  const trimmedContext = useMemo(() => contextName.trim(), [contextName]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <KeyRound className="size-6" />
          <div>
            <h1 className="text-xl font-semibold">Secrets</h1>
            <p className="text-sm text-muted-foreground">
              Encrypted and committed to this workflow's linked git repository.
            </p>
          </div>
        </div>
        {trimmedContext && !loadError && (
          <Sheet open={addOpen} onOpenChange={setAddOpen}>
            <SheetTrigger render={<Button />}>
              <Plus className="size-4" /> Add secret
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Add a secret</SheetTitle>
                <SheetDescription>
                  Encrypted with this repo's public key and committed to
                  contexts/{trimmedContext}/secrets.enc.
                </SheetDescription>
              </SheetHeader>
              <AddSecretForm
                onAdded={async (key, value) => {
                  await setSecret(workflowId, trimmedContext, key, value);
                  setAddOpen(false);
                  refetchKeys();
                }}
              />
            </SheetContent>
          </Sheet>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Context</label>
        <ContextPicker
          value={contextName}
          onChange={setContextName}
          knownContexts={knownContexts}
        />
      </div>

      {!trimmedContext && (
        <p className="text-sm text-muted-foreground">
          Choose or enter a context name to manage its secrets.
        </p>
      )}

      {trimmedContext && loadError && (
        <Card className="flex flex-row items-start gap-3 p-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Secrets editor unavailable</p>
            <p className="text-sm text-muted-foreground">{loadError}</p>
          </div>
        </Card>
      )}

      {trimmedContext && !loadError && !keys && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {trimmedContext && !loadError && keys && (
        <SecretsTable
          keys={keys}
          onDelete={async (key) => {
            await deleteSecret(workflowId, trimmedContext, key);
            refetchKeys();
          }}
        />
      )}
    </div>
  );
}
