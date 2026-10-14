import { useState } from "react";
import {
  Button,
  InputField,
  InputGroup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  useIcon,
} from "@ritaj/ui";
import { describe, type ReleaseAction } from "../api.ts";
import { useApi } from "../api-provider.tsx";
import { go, runHash } from "../places.ts";
import { Notice } from "./notice.tsx";
import { Panel } from "./panel.tsx";

const BUMPS = ["patch", "minor", "major"] as const;

/** How each release action is asked for: what it's called, and what its argument is. */
const ACTIONS: Readonly<
  Record<
    ReleaseAction,
    { label: string; argument: string; placeholder?: string; first: string }
  >
> = {
  next: { label: "Next version", argument: "Bump", first: "patch" },
  set: {
    label: "Set a version",
    argument: "Version",
    placeholder: "2.0.0",
    first: "",
  },
  resume: {
    label: "Resume a release",
    argument: "Tag",
    placeholder: "1.4.2",
    first: "",
  },
};

/**
 * Releases the whole project: one tag for its repository, every ship its
 * manifests declare packed and published, with its release credentials.
 */
export function ReleasePanel(
  { project, versions }: { project: string; versions: readonly string[] },
) {
  const api = useApi();
  const [action, setAction] = useState<ReleaseAction>("next");
  const [argument, setArgument] = useState(ACTIONS.next.first);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const ReleaseIcon = useIcon("rocket");

  async function release() {
    setBusy(true);
    setError(undefined);
    try {
      const run = await api.release(project, {
        action,
        argument: argument.trim(),
      });
      go(runHash(run.id));
    } catch (e) {
      setError(describe(e));
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Release"
      description={`Tags ${project} at its branch's tip and publishes every ship its manifests declare${
        versions[0] ? `; the last release is ${versions[0]}` : ""
      }.`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={action}
          onValueChange={(next) => {
            setAction(next as ReleaseAction);
            setArgument(ACTIONS[next as ReleaseAction].first);
          }}
        >
          <SelectTrigger aria-label="Release action" className="w-48" />
          <SelectContent>
            {(Object.keys(ACTIONS) as ReleaseAction[]).map((name, i) => (
              <SelectItem key={name} index={i} value={name}>
                {ACTIONS[name].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {action === "next"
          ? (
            <Select value={argument} onValueChange={setArgument}>
              <SelectTrigger aria-label="Bump" className="w-32" />
              <SelectContent>
                {BUMPS.map((bump, i) => (
                  <SelectItem key={bump} index={i} value={bump}>
                    {bump}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
          : (
            <InputGroup className="w-44">
              <InputField
                index={0}
                label={ACTIONS[action].argument}
                labelHidden
                placeholder={ACTIONS[action].placeholder}
                value={argument}
                onChange={setArgument}
              />
            </InputGroup>
          )}
        <Button
          leadingIcon={ReleaseIcon}
          loading={busy}
          disabled={busy || !argument.trim()}
          onClick={release}
        >
          Release
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </Panel>
  );
}
