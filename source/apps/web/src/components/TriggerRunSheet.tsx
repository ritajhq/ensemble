import { useState } from "react";
import {
  triggerGithubWorkflow,
  triggerManualWorkflow,
  type ManualInput,
  type WorkflowContextsSummary,
  type WorkflowTriggerSummary,
} from "../lib/api.ts";
import { TriggerIcon, triggerTypeLabel } from "../lib/triggers.tsx";
import {
  Button,
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

/** Current value for one declared manual input, keyed by its name — string/number inputs stay as their raw text until submit so an in-progress edit (e.g. "-", "1.") isn't clobbered. A `job` input with `multiple: true` holds a string array instead. */
type ManualInputValues = Record<string, string | boolean | string[]>;

function defaultManualValues(inputs: ManualInput[]): ManualInputValues {
  const values: ManualInputValues = {};
  for (const input of inputs) {
    if (input.type === "boolean") {
      values[input.name] = typeof input.default === "boolean" ? input.default : false;
    } else if (input.type === "job" && input.multiple) {
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
  if (input.type === "job" && input.multiple) {
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
    case "job":
      return text;
  }
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

  if (input.type === "job" && input.multiple) {
    const selected = value as string[];
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor={id}>
          {label}
          {input.default === undefined && <span className="text-destructive"> *</span>}
        </label>
        <select
          id={id}
          multiple
          value={selected}
          onChange={(event) => onChange(Array.from(event.target.selectedOptions, (o) => o.value))}
          className="rounded-md border border-input bg-transparent px-3 py-1 text-sm"
        >
          {jobs.map((jobId) => <option key={jobId} value={jobId}>{jobId}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">Cmd/Ctrl-click to select multiple jobs.</p>
      </div>
    );
  }

  if (input.type === "job") {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor={id}>
          {label}
          {input.default === undefined && <span className="text-destructive"> *</span>}
        </label>
        <select
          id={id}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="" disabled>Select a job…</option>
          {jobs.map((jobId) => <option key={jobId} value={jobId}>{jobId}</option>)}
        </select>
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
      {input.type === "git-tags" && (
        <p className="text-xs text-muted-foreground">Tag name — see {input.repository}</p>
      )}
      {input.type === "object" && <p className="text-xs text-muted-foreground">JSON object.</p>}
    </div>
  );
}

/** Dropdown for a workflow's declared `contexts:` — resolved server-side into `context.name`/`context.path`, unrelated to `trigger.*`/`inputs`. */
function ContextField(
  { contexts, value, onChange }: { contexts: WorkflowContextsSummary; value: string; onChange: (value: string) => void },
) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground" htmlFor="manual-trigger-context">
        Context
        {contexts.defaultName === undefined && <span className="text-destructive"> *</span>}
      </label>
      <Select value={value || undefined} onValueChange={(next) => onChange(next ?? "")}>
        <SelectTrigger id="manual-trigger-context" className="w-full">
          <SelectValue placeholder="Select a context…" />
        </SelectTrigger>
        <SelectContent>
          {contexts.names.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function ManualTriggerForm(
  { workflowId, inputs, jobs, contexts, onTriggered }: {
    workflowId: string;
    inputs: ManualInput[];
    jobs: string[];
    contexts?: WorkflowContextsSummary;
    onTriggered: () => void;
  },
) {
  const [values, setValues] = useState<ManualInputValues>(() => defaultManualValues(inputs));
  const [context, setContext] = useState(() => contexts?.defaultName ?? "");
  const [status, setStatus] = useState<
    { state: "idle" } | { state: "loading" } | { state: "error"; message: string }
  >({ state: "idle" });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (contexts !== undefined && context === "") {
      setStatus({ state: "error", message: "A context is required." });
      return;
    }
    setStatus({ state: "loading" });
    try {
      const parsed: Record<string, unknown> = {};
      for (const input of inputs) {
        parsed[input.name] = parseManualValue(input, values[input.name]);
      }
      await triggerManualWorkflow(workflowId, parsed, contexts !== undefined ? context : undefined);
      setStatus({ state: "idle" });
      onTriggered();
    } catch (error) {
      setStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <form className="flex flex-col gap-3 p-4 pt-0" onSubmit={handleSubmit}>
      {inputs.length === 0 && contexts === undefined && (
        <p className="text-sm text-muted-foreground">This trigger takes no inputs.</p>
      )}
      {contexts !== undefined && <ContextField contexts={contexts} value={context} onChange={setContext} />}
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
  { workflowId, tagPatterns, onTriggered }: { workflowId: string; tagPatterns: string[]; onTriggered: () => void },
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
    /** This workflow's declared `contexts:`, if any — only meaningful for a "manual" trigger's own form. */
    contexts?: WorkflowContextsSummary;
    onTriggered: () => void;
  },
) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button size="sm" variant="secondary" />}>
        <TriggerIcon trigger={trigger} className="size-4" />
        {triggerTypeLabel(trigger.type)}
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <TriggerIcon trigger={trigger} className="size-4" />
            Run — {triggerTypeLabel(trigger.type)}
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
