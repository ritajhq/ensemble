import { useState } from "react";
import {
  Button,
  InputField,
  InputGroup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@ritaj/ui";
import { describe, type Manifest, type PreviewSettings } from "../api.ts";
import { useApi } from "../api-provider.tsx";
import { Notice } from "./notice.tsx";

/** What overrides look like, before any is written. */
const OVERRIDES_EXAMPLE =
  "domain = {internal}\ndashboard_origin = https://{host:dashboard}";

/** What a manifest's first environment is called: never a preview's base. */
const PRODUCTION = "production";

/** `name = template` lines, as overrides. */
function overridesOf(text: string): Record<string, string> {
  return Object.fromEntries(
    text.split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      }),
  );
}

function textOf(overrides: Readonly<Record<string, string>>): string {
  return Object.entries(overrides).map(([name, template]) =>
    `${name} = ${template}`
  ).join("\n");
}

/**
 * How one manifest is previewed: the branches it tracks, the environment
 * whose values each preview starts from — never production — the kit, and
 * the variables each preview sets for itself.
 */
export function PreviewSettingsForm(
  { project, manifest, kits, settings, onChanged }: {
    project: string;
    manifest: Manifest;
    kits: readonly string[];
    settings?: PreviewSettings;
    onChanged(): void;
  },
) {
  const api = useApi();
  const bases = manifest.environments
    .map((environment) => environment.name)
    .filter((name) => name !== PRODUCTION);
  const [branches, setBranches] = useState(
    settings?.branches.join(", ") ?? "feat/*",
  );
  const [base, setBase] = useState(settings?.base ?? bases[0] ?? "");
  const [kit, setKit] = useState(settings?.kit ?? kits[0] ?? "");
  const [overrides, setOverrides] = useState(
    textOf(settings?.overrides ?? {}),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

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

  if (bases.length === 0) {
    return (
      <p className="text-caption text-muted-foreground">
        To preview branches, add an environment beside production — say
        "preview" — with values fit for code nobody reviewed yet: previews start
        from it, never from production.
      </p>
    );
  }

  return (
    <form
      className="grid gap-2 rounded-md border border-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        act(() =>
          api.setPreviewSettings(project, {
            manifest: manifest.name,
            branches: branches.split(",").map((b) => b.trim()).filter(Boolean),
            base,
            kit,
            overrides: overridesOf(overrides),
          })
        );
      }}
    >
      <span className="text-body font-medium">
        Previews {settings ? "" : "(off)"}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="min-w-0 flex-1">
          <InputField
            index={0}
            label="Branches"
            placeholder="feat/*, fix/*"
            value={branches}
            onChange={setBranches}
          />
        </InputGroup>
        <Select value={base} onValueChange={setBase}>
          <SelectTrigger aria-label="Base environment" className="w-40" />
          <SelectContent>
            {bases.map((name, i) => (
              <SelectItem key={name} index={i} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={kit} onValueChange={setKit}>
          <SelectTrigger aria-label="Kit" className="w-32" />
          <SelectContent>
            {kits.map((name, i) => (
              <SelectItem key={name} index={i} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <textarea
        className="min-h-24 rounded-md border border-border bg-transparent p-2 font-mono text-caption"
        placeholder={OVERRIDES_EXAMPLE}
        value={overrides}
        onChange={(event) => setOverrides(event.target.value)}
      />
      <p className="text-caption text-muted-foreground">
        One variable per line, as <code>name = template</code>: {"{slug}"},{" "}
        {"{branch}"}, {"{internal}"}{" "}
        (the preview's own domain, which its gateway answers on), {"{host}"} and
        {" "}
        {"{host:<subdomain>}"}{" "}
        (the public host a browser reaches it at). A preview runs whatever its
        branch holds and can read every value it is given: give its base
        environment only values that are fine to lose.
      </p>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" disabled={busy || !base}>
          {settings ? "Save" : "Preview this manifest"}
        </Button>
        {settings && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => act(() => api.stopPreviews(project, manifest.name))}
          >
            Stop previewing
          </Button>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </form>
  );
}
