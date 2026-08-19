import { useEffect, useState } from "react";
import {
  fetchRemoteGitTags,
  triggerGithubWorkflow,
  triggerManualWorkflow,
  type ManualInput,
  type WorkflowTriggerSummary,
} from "../lib/api.ts";
import { TriggerIcon, triggerTypeLabel } from "../lib/triggers.tsx";
import {
  Button,
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
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
  useComboboxAnchor,
} from "@ritaj/ui";

/** Current value for one declared manual input, keyed by its name — string/number inputs stay as their raw text until submit so an in-progress edit (e.g. "-", "1.") isn't clobbered. A `job` input holds a string array instead. */
type ManualInputValues = Record<string, string | boolean | string[]>;

function defaultManualValues(inputs: ManualInput[]): ManualInputValues {
  const values: ManualInputValues = {};
  for (const input of inputs) {
    if (input.type === "boolean") {
      values[input.name] = typeof input.default === "boolean" ? input.default : false;
    } else if (input.type === "job") {
      values[input.name] = Array.isArray(input.default) ? input.default : [];
    } else {
      values[input.name] = input.default !== undefined ? String(input.default) : "";
    }
  }
  return values;
}

/** Parses a manual input's raw form value back into what the trigger expects, throwing a user-facing message on a bad value (e.g. malformed JSON). */
function parseManualValue(input: ManualInput, raw: string | boolean | string[]): unknown {
  if (input.type === "boolean") return raw;
  if (input.type === "job") {
    const jobs = raw as string[];
    if (jobs.length === 0) {
      if (input.default !== undefined) return input.default;
      throw new Error(`"${input.display ?? input.name}" is required.`);
    }
    return jobs;
  }
  const text = String(raw);
  if (text.length === 0) {
    if (input.default !== undefined) return input.default;
    throw new Error(`"${input.display ?? input.name}" is required.`);
  }
  switch (input.type) {
    case "number": {
      const value = Number(text);
      if (Number.isNaN(value)) throw new Error(`"${input.display ?? input.name}" must be a number.`);
      return value;
    }
    case "object":
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`"${input.display ?? input.name}" must be valid JSON.`);
      }
    case "string":
    case "git-tags":
    case "context":
      return text;
  }
}

/** Multi-select combobox for a `job`-typed manual input — job ids the user has picked render as removable chips, with the dropdown filtered by what's typed. */
function JobCombobox(
  { id, jobs, selected, onChange }: {
    id: string;
    jobs: string[];
    selected: string[];
    onChange: (value: string[]) => void;
  },
) {
  const anchor = useComboboxAnchor();

  return (
    <Combobox items={jobs} multiple value={selected} onValueChange={onChange}>
      <ComboboxChips ref={anchor} className="w-full">
        <ComboboxChipsInput id={id} placeholder={selected.length === 0 ? "Select jobs…" : undefined} />
        {selected.map((jobId) => <ComboboxChip key={jobId} aria-label={jobId}>{jobId}</ComboboxChip>)}
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No jobs found.</ComboboxEmpty>
        <ComboboxList>
          {(jobId: string) => <ComboboxItem key={jobId} value={jobId}>{jobId}</ComboboxItem>}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/**
 * Single-select searchable combobox for a `git-tags`-typed manual input —
 * lists tags fetched from the input's declared repository, filtered as the
 * user types. The typed text itself is the form value (via
 * onInputValueChange), so picking a tag from the list or just typing one
 * that isn't in it both work — useful since the list reflects the repo at
 * fetch time and a brand-new tag may not have shown up yet.
 */
function GitTagsCombobox(
  { id, repository, value, onChange }: {
    id: string;
    repository: string;
    value: string;
    onChange: (value: string) => void;
  },
) {
  const [tags, setTags] = useState<string[] | null>(null);

  useEffect(() => {
    setTags(null);
    fetchRemoteGitTags(repository).then(setTags).catch(() => setTags([]));
  }, [repository]);

  return (
    <Combobox
      items={tags ?? []}
      inputValue={value}
      onInputValueChange={onChange}
    >
      <ComboboxInput
        id={id}
        placeholder={tags === null ? "Loading tags…" : "Select or type a tag…"}
      />
      <ComboboxContent>
        <ComboboxEmpty>No tags match — the typed value will be used as-is.</ComboboxEmpty>
        <ComboboxList>
          {(tag: string) => <ComboboxItem key={tag} value={tag}>{tag}</ComboboxItem>}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function ManualInputField(
  { input, value, onChange, jobs }: {
    input: ManualInput;
    value: string | boolean | string[];
    onChange: (value: string | boolean | string[]) => void;
    jobs: string[];
  },
) {
  const label = input.display ?? input.name;
  const id = `manual-input-${input.name}`;

  if (input.type === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          className="size-4 rounded border-input accent-primary"
        />
        <label htmlFor={id} className="text-sm">
          {label}
          {input.default === undefined && <span className="text-destructive"> *</span>}
        </label>
      </div>
    );
  }

  if (input.type === "job") {
    const selected = value as string[];
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor={id}>
          {label}
          {input.default === undefined && <span className="text-destructive"> *</span>}
        </label>
        <JobCombobox id={id} jobs={jobs} selected={selected} onChange={onChange} />
      </div>
    );
  }

  if (input.type === "git-tags") {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor={id}>
          {label}
          {input.default === undefined && <span className="text-destructive"> *</span>}
        </label>
        <GitTagsCombobox
          id={id}
          repository={input.repository}
          value={value as string}
          onChange={onChange}
        />
        <p className="text-xs text-muted-foreground">{input.repository}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground" htmlFor={id}>
        {label}
        {input.default === undefined && <span className="text-destructive"> *</span>}
      </label>
      <Input
        id={id}
        type={input.type === "number" ? "number" : "text"}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
        placeholder={input.default !== undefined ? String(input.default) : undefined}
        className={input.type === "object" ? "font-mono" : undefined}
      />
      {input.type === "object" && <p className="text-xs text-muted-foreground">JSON object.</p>}
    </div>
  );
}

/** No-context sentinel for the Select below — Select's own value can't be an empty string. */
const NO_CONTEXT = "__none__";

/**
 * Picks an optional deploy context name — resolved server-side against this
 * workflow's declared context.variables/context.secrets, unrelated to
 * trigger/inputs. When the workflow declares known contexts (one per
 * contexts/<name> subdirectory — see WorkflowSummary.contexts), offers them
 * as a closed choice list instead of free text, since guessing a name here
 * either resolves to nothing (silently falls back to defaults) or a context
 * that doesn't exist for this workflow at all. Falls back to free text for a
 * workflow with no contexts/ directory, or one whose valid names come from
 * elsewhere (e.g. a remote loader).
 */
function ContextField(
  { value, onChange, knownContexts }: { value: string; onChange: (value: string) => void; knownContexts: string[] },
) {
  if (knownContexts.length > 0) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="manual-trigger-context">
          Context <span className="text-muted-foreground">(optional)</span>
        </label>
        <Select
          value={value || NO_CONTEXT}
          onValueChange={(next) => onChange(!next || next === NO_CONTEXT ? "" : next)}
        >
          <SelectTrigger id="manual-trigger-context" className="w-full">
            <SelectValue>
              {(current: string | null) => current === NO_CONTEXT || !current ? "None" : current}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CONTEXT}>None</SelectItem>
            {knownContexts.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground" htmlFor="manual-trigger-context">
        Context <span className="text-muted-foreground">(optional)</span>
      </label>
      <Input
        id="manual-trigger-context"
        placeholder="production"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function ManualTriggerForm(
  { workflowId, inputs, jobs, contexts, onTriggered }: {
    workflowId: string;
    inputs: ManualInput[];
    jobs: string[];
    contexts: string[];
    onTriggered: () => void;
  },
) {
  const [values, setValues] = useState<ManualInputValues>(() => defaultManualValues(inputs));
  const [context, setContext] = useState("");
  const [status, setStatus] = useState<
    { state: "idle" } | { state: "loading" } | { state: "error"; message: string }
  >({ state: "idle" });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ state: "loading" });
    try {
      const parsed: Record<string, unknown> = {};
      for (const input of inputs) {
        parsed[input.name] = parseManualValue(input, values[input.name]);
      }
      await triggerManualWorkflow(workflowId, parsed, context.trim() || undefined);
      setStatus({ state: "idle" });
      onTriggered();
    } catch (error) {
      setStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <form className="flex flex-col gap-3 p-4 pt-0" onSubmit={handleSubmit}>
      {inputs.length === 0 && (
        <p className="text-sm text-muted-foreground">This trigger takes no inputs.</p>
      )}
      <ContextField value={context} onChange={setContext} knownContexts={contexts} />
      {inputs.map((input) => (
        <ManualInputField
          key={input.name}
          input={input}
          value={values[input.name]}
          onChange={(value) => setValues((current) => ({ ...current, [input.name]: value }))}
          jobs={jobs}
        />
      ))}
      <div>
        <Button type="submit" disabled={status.state === "loading"}>
          {status.state === "loading" ? "Running…" : "Run"}
        </Button>
      </div>
      {status.state === "error" && <p className="text-sm text-destructive">{status.message}</p>}
    </form>
  );
}

function GithubTriggerForm(
  { workflowId, tagPatterns, context, onTriggered }: {
    workflowId: string;
    tagPatterns: string[];
    context?: string;
    onTriggered: () => void;
  },
) {
  const [tag, setTag] = useState("");
  const [sha, setSha] = useState("");
  const [status, setStatus] = useState<
    { state: "idle" } | { state: "loading" } | { state: "error"; message: string }
  >({ state: "idle" });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ state: "loading" });
    try {
      await triggerGithubWorkflow(workflowId, tag.trim(), sha.trim() || undefined);
      setStatus({ state: "idle" });
      onTriggered();
    } catch (error) {
      setStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <form className="flex flex-col gap-3 p-4 pt-0" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="github-trigger-tag">
          Tag
        </label>
        <Input
          id="github-trigger-tag"
          placeholder="1.2.3"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          Must match: {tagPatterns.join(", ")}
        </p>
        <p className="text-xs text-muted-foreground">
          Runs under context: {context ?? "none"}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="github-trigger-sha">
          Commit SHA <span className="text-muted-foreground">(optional)</span>
        </label>
        <Input
          id="github-trigger-sha"
          placeholder="a1b2c3d"
          value={sha}
          onChange={(event) => setSha(event.target.value)}
          className="font-mono"
        />
      </div>
      <div>
        <Button type="submit" disabled={status.state === "loading" || tag.trim().length === 0}>
          {status.state === "loading" ? "Running…" : "Run"}
        </Button>
      </div>
      {status.state === "error" && <p className="text-sm text-destructive">{status.message}</p>}
    </form>
  );
}

/** A trigger's run button — opens a sheet on the right to collect that trigger's inputs, then runs it. */
export function TriggerRunSheet(
  { workflowId, trigger, contexts, onTriggered }: {
    workflowId: string;
    trigger: WorkflowTriggerSummary;
    contexts: string[];
    onTriggered: () => void;
  },
) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button size="sm" variant="secondary" />}>
        <TriggerIcon trigger={trigger} className="size-4" />
        {triggerTypeLabel(trigger)}
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <TriggerIcon trigger={trigger} className="size-4" />
            Run — {triggerTypeLabel(trigger)}
          </SheetTitle>
          <SheetDescription>
            {trigger.type === "manual"
              ? "Provide values for this trigger's declared inputs, then run."
              : "Simulate a tag push for this trigger by hand."}
          </SheetDescription>
        </SheetHeader>
        {trigger.type === "manual"
          ? (
            <ManualTriggerForm
              workflowId={workflowId}
              inputs={trigger.inputs}
              jobs={trigger.jobs}
              contexts={contexts}
              onTriggered={() => {
                setOpen(false);
                onTriggered();
              }}
            />
          )
          : (
            <GithubTriggerForm
              workflowId={workflowId}
              tagPatterns={trigger.tagPatterns}
              context={trigger.context}
              onTriggered={() => {
                setOpen(false);
                onTriggered();
              }}
            />
          )}
      </SheetContent>
    </Sheet>
  );
}
