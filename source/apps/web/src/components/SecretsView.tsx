import {
  Braces,
  FileLock2,
  FileText,
  FileUp,
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import {
  type ContextFileSummary,
  type ContextVariableSummary,
  deleteSecret,
  deleteSecretFile,
  fetchContextValues,
  fetchSecretsContext,
  fetchWorkflow,
  type SecretFileSummary,
  type SecretKeySummary,
  setSecret,
  setSecretFile,
} from "../lib/api.ts";
import {
  Button,
  Card,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
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

/**
 * Wraps a table in a fixed-height, internally-scrolling frame with a local
 * search box — these tables aren't expected to hold large lists, so a
 * search filters the already-loaded rows client-side rather than hitting
 * the server.
 */
function SearchableTable(
  { search, onSearchChange, placeholder, children }: {
    search: string;
    onSearchChange: (value: string) => void;
    placeholder: string;
    children: React.ReactNode;
  },
) {
  return (
    <div className="flex flex-col gap-2">
      <InputGroup className="max-w-sm">
        <InputGroupAddon>
          <Search className="size-4" />
        </InputGroupAddon>
        <InputGroupInput
          placeholder={placeholder}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </InputGroup>
      <Card className="max-h-72 overflow-y-auto py-0">
        {children}
      </Card>
    </div>
  );
}

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
  { fixedKey, onAdded }: {
    /** Pre-fills and locks the Name field — used when editing an existing key from its row, so retyping it can't introduce a typo that creates a second, similarly-named secret instead of replacing the intended one. */
    fixedKey?: string;
    onAdded: (key: string, value: string) => Promise<void>;
  },
) {
  const [key, setKey] = useState(fixedKey ?? "");
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<
    { state: "idle" } | { state: "loading" } | {
      state: "error";
      message: string;
    }
  >({
    state: "idle",
  });

  useEffect(() => {
    setKey(fixedKey ?? "");
    setValue("");
    setStatus({ state: "idle" });
  }, [fixedKey]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ state: "loading" });
    try {
      await onAdded(key.trim(), value);
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
          disabled={fixedKey !== undefined}
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
  { keys, search, onEdit, onDelete }: {
    keys: SecretKeySummary[];
    search: string;
    onEdit: (key: string) => void;
    onDelete: (key: string) => Promise<void>;
  },
) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      keys.filter(({ key }) =>
        key.toLowerCase().includes(search.trim().toLowerCase())
      ),
    [keys, search],
  );

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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={2}
                className="text-center text-muted-foreground"
              >
                {keys.length === 0 ? "No secrets set." : "No matches."}
              </TableCell>
            </TableRow>
          )}
          {filtered.map(({ key }) => (
            <TableRow key={key}>
              <TableCell className="font-medium font-mono">{key}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => onEdit(key)}
                  >
                    <Pencil className="size-3.5" />
                    <span className="sr-only">Edit secret</span>
                  </Button>
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
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SecretsSection(
  { workflowId, trimmedContext, keys, refetchKeys }: {
    workflowId: string;
    trimmedContext: string;
    keys: SecretKeySummary[];
    refetchKeys: () => void;
  },
) {
  /** undefined = closed, "" = adding a new secret, a key name = editing that one (pre-filled, locked). */
  const [editorKey, setEditorKey] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="size-4 text-muted-foreground" /> Secrets
        </h2>
        <Sheet
          open={editorKey !== undefined}
          onOpenChange={(open) => setEditorKey(open ? "" : undefined)}
        >
          <SheetTrigger render={<Button size="sm" />}>
            <Plus className="size-4" /> Add secret
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>
                {editorKey ? `Replace "${editorKey}"` : "Add a secret"}
              </SheetTitle>
              <SheetDescription>
                Encrypted with this repo's public key and committed to
                contexts/{trimmedContext}/secrets.enc.
              </SheetDescription>
            </SheetHeader>
            <AddSecretForm
              fixedKey={editorKey || undefined}
              onAdded={async (key, value) => {
                await setSecret(workflowId, trimmedContext, key, value);
                setEditorKey(undefined);
                refetchKeys();
              }}
            />
          </SheetContent>
        </Sheet>
      </div>
      <SearchableTable
        search={search}
        onSearchChange={setSearch}
        placeholder="Search secrets..."
      >
        <SecretsTable
          keys={keys}
          search={search}
          onEdit={(key) => setEditorKey(key)}
          onDelete={async (key) => {
            await deleteSecret(workflowId, trimmedContext, key);
            refetchKeys();
          }}
        />
      </SearchableTable>
    </div>
  );
}

function AddSecretFileForm(
  { entryName, onAdded }: {
    entryName: string;
    onAdded: (file: File) => Promise<void>;
  },
) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<
    { state: "idle" } | { state: "loading" } | {
      state: "error";
      message: string;
    }
  >({ state: "idle" });

  useEffect(() => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setStatus({ state: "idle" });
  }, [entryName]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setStatus({ state: "loading" });
    try {
      await onAdded(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
        <label className="text-xs text-muted-foreground" htmlFor="secret-file">
          File
        </label>
        <input
          id="secret-file"
          ref={fileInputRef}
          type="file"
          required
          className="rounded-md border border-input bg-transparent px-3 py-1.5 text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs file:font-medium"
        />
      </div>
      <div>
        <Button type="submit" disabled={status.state === "loading"}>
          {status.state === "loading" ? "Encrypting & committing…" : "Save"}
        </Button>
      </div>
      {status.state === "error" && (
        <p className="text-sm text-destructive">{status.message}</p>
      )}
    </form>
  );
}

function SecretFilesTable(
  { files, search, onEdit, onDelete }: {
    files: SecretFileSummary[];
    search: string;
    onEdit: (name: string) => void;
    onDelete: (name: string) => Promise<void>;
  },
) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      files.filter(({ name }) =>
        name.toLowerCase().includes(search.trim().toLowerCase())
      ),
    [files, search],
  );

  async function handleDelete(name: string) {
    setPending(name);
    setError(null);
    try {
      await onDelete(name);
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={3}
                className="text-center text-muted-foreground"
              >
                {files.length === 0
                  ? "This workflow declares no context.secrets.files entries."
                  : "No matches."}
              </TableCell>
            </TableRow>
          )}
          {filtered.map(({ name, isSet }) => (
            <TableRow key={name}>
              <TableCell className="font-medium font-mono">{name}</TableCell>
              <TableCell className="text-muted-foreground">
                {isSet ? "Set" : "Not set"}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => onEdit(name)}
                  >
                    {isSet ? <Pencil className="size-3.5" /> : (
                      <FileUp className="size-3.5" />
                    )}
                    <span className="sr-only">
                      {isSet ? "Replace file secret" : "Upload file secret"}
                    </span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={!isSet || pending === name}
                    onClick={() => handleDelete(name)}
                  >
                    <Trash2 className="size-3.5" />
                    <span className="sr-only">Delete file secret</span>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ContextVariablesTable(
  { variables, search }: { variables: ContextVariableSummary[]; search: string },
) {
  const filtered = useMemo(
    () =>
      variables.filter(({ name }) =>
        name.toLowerCase().includes(search.trim().toLowerCase())
      ),
    [variables, search],
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filtered.length === 0 && (
          <TableRow>
            <TableCell colSpan={2} className="text-center text-muted-foreground">
              {variables.length === 0
                ? "This workflow declares no context.variables entries."
                : "No matches."}
            </TableCell>
          </TableRow>
        )}
        {filtered.map(({ name, value }) => (
          <TableRow key={name}>
            <TableCell className="font-medium font-mono">{name}</TableCell>
            <TableCell className="font-mono text-muted-foreground">
              {value ?? <span className="italic">unresolved</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ContextFilesTable(
  { files, search }: { files: ContextFileSummary[]; search: string },
) {
  const filtered = useMemo(
    () =>
      files.filter(({ name }) =>
        name.toLowerCase().includes(search.trim().toLowerCase())
      ),
    [files, search],
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Path</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filtered.length === 0 && (
          <TableRow>
            <TableCell colSpan={2} className="text-center text-muted-foreground">
              {files.length === 0
                ? "This workflow declares no context.files entries."
                : "No matches."}
            </TableCell>
          </TableRow>
        )}
        {filtered.map(({ name, path }) => (
          <TableRow key={name}>
            <TableCell className="font-medium font-mono">{name}</TableCell>
            <TableCell className="font-mono text-muted-foreground">{path}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SecretFilesSection(
  { workflowId, trimmedContext, files, refetchFiles }: {
    workflowId: string;
    trimmedContext: string;
    files: SecretFileSummary[];
    refetchFiles: () => void;
  },
) {
  const [editorName, setEditorName] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <FileLock2 className="size-4 text-muted-foreground" /> Secret files
        </h2>
      </div>
      <Sheet
        open={editorName !== undefined}
        onOpenChange={(open) => !open && setEditorName(undefined)}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {editorName && `Upload "${editorName}"`}
            </SheetTitle>
            <SheetDescription>
              Encrypted with this repo's public key and committed to
              contexts/{trimmedContext}/secrets/&lt;path&gt;.enc.
            </SheetDescription>
          </SheetHeader>
          {editorName && (
            <AddSecretFileForm
              entryName={editorName}
              onAdded={async (file) => {
                await setSecretFile(workflowId, trimmedContext, editorName, file);
                setEditorName(undefined);
                refetchFiles();
              }}
            />
          )}
        </SheetContent>
      </Sheet>
      <SearchableTable
        search={search}
        onSearchChange={setSearch}
        placeholder="Search secret files..."
      >
        <SecretFilesTable
          files={files}
          search={search}
          onEdit={(name) => setEditorName(name)}
          onDelete={async (name) => {
            await deleteSecretFile(workflowId, trimmedContext, name);
            refetchFiles();
          }}
        />
      </SearchableTable>
    </div>
  );
}

/**
 * Adds, replaces, or removes one context's secrets for a git-linked
 * workflow — committing the change directly to that workflow's linked repo
 * (see @ensemble/core's git-write.ts). Values/file content are never
 * fetched for display: the API only ever returns key/declared-entry names,
 * matching GitIntegrationView's principle of never round-tripping a stored
 * secret. A workflow with no linked git repository has no working editor
 * here (the server 404s with a clear message) — its secrets are edited
 * locally via `ens workflow secrets edit` instead, same file format either
 * way.
 */
export function SecretsView() {
  const { workflowId = "" } = useParams();
  const [knownContexts, setKnownContexts] = useState<string[]>([]);
  const [contextName, setContextName] = useState("");
  const [keys, setKeys] = useState<SecretKeySummary[] | null>(null);
  const [files, setFiles] = useState<SecretFileSummary[] | null>(null);
  const [variableValues, setVariableValues] = useState<
    ContextVariableSummary[] | null
  >(null);
  const [fileValues, setFileValues] = useState<ContextFileSummary[] | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkflow(workflowId)
      .then((workflow) => {
        const contexts = workflow.contexts;
        setKnownContexts(contexts);
        if (contexts.length > 0 && !contextName) setContextName(contexts[0]);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  function refetch() {
    const trimmed = contextName.trim();
    if (!trimmed) {
      setKeys(null);
      setFiles(null);
      setVariableValues(null);
      setFileValues(null);
      return;
    }
    Promise.all([
      fetchSecretsContext(workflowId, trimmed),
      fetchContextValues(workflowId, trimmed),
    ])
      .then(([secrets, values]) => {
        setKeys(secrets.keys);
        setFiles(secrets.files);
        setVariableValues(values.variables);
        setFileValues(values.files);
        setLoadError(null);
      })
      .catch((error) => {
        setKeys(null);
        setFiles(null);
        setVariableValues(null);
        setFileValues(null);
        setLoadError(error instanceof Error ? error.message : String(error));
      });
  }

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, contextName]);

  const trimmedContext = useMemo(() => contextName.trim(), [contextName]);
  const loaded = keys && files && variableValues && fileValues;

  const [variablesSearch, setVariablesSearch] = useState("");
  const [filesSearch, setFilesSearch] = useState("");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-6">
      <div className="flex items-center gap-3">
        <KeyRound className="size-6" />
        <div>
          <h1 className="text-xl font-semibold">Secrets and variables</h1>
          <p className="text-sm text-muted-foreground">
            Committed to this workflow's linked git repository — secrets are
            encrypted, variables and files are plaintext.
          </p>
        </div>
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
          Choose or enter a context name to manage its secrets and variables.
        </p>
      )}

      {trimmedContext && loadError && (
        <Card className="flex flex-row items-start gap-3 p-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Editor unavailable</p>
            <p className="text-sm text-muted-foreground">{loadError}</p>
          </div>
        </Card>
      )}

      {trimmedContext && !loadError && !loaded && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {trimmedContext && !loadError && loaded && (
        <div className="flex flex-col gap-8">
          <SecretsSection
            workflowId={workflowId}
            trimmedContext={trimmedContext}
            keys={keys}
            refetchKeys={refetch}
          />
          <SecretFilesSection
            workflowId={workflowId}
            trimmedContext={trimmedContext}
            files={files}
            refetchFiles={refetch}
          />
          <div className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Braces className="size-4 text-muted-foreground" /> Variables
            </h2>
            <SearchableTable
              search={variablesSearch}
              onSearchChange={setVariablesSearch}
              placeholder="Search variables..."
            >
              <ContextVariablesTable
                variables={variableValues}
                search={variablesSearch}
              />
            </SearchableTable>
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <FileText className="size-4 text-muted-foreground" /> Files
            </h2>
            <SearchableTable
              search={filesSearch}
              onSearchChange={setFilesSearch}
              placeholder="Search files..."
            >
              <ContextFilesTable files={fileValues} search={filesSearch} />
            </SearchableTable>
          </div>
        </div>
      )}
    </div>
  );
}
