import { useState } from "react";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  useIcon,
} from "@ritaj/ui";
import { describe, type EnvironmentPath, type Termination } from "../api.ts";
import { useApi } from "../api-provider.tsx";
import { go, runHash } from "../places.ts";
import { Notice } from "./notice.tsx";

/** What "the newest release" is asked for as. */
const LATEST = "latest";

/** Deploys one environment: a kit and a released version, planned first or applied. */
export function DeployBar(
  { at, kits, versions, missing }: {
    at: EnvironmentPath;
    kits: readonly string[];
    versions: readonly string[];
    /** Values the environment still lacks: a deploy would fail on them. */
    missing: number;
  },
) {
  const api = useApi();
  const [kit, setKit] = useState(kits[0] ?? "");
  const [version, setVersion] = useState(LATEST);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const PlanIcon = useIcon("search");
  const DeployIcon = useIcon("rocket");

  async function deploy(termination: Termination) {
    setBusy(true);
    setError(undefined);
    try {
      const run = await api.deploy(at, { kit, version, termination });
      go(runHash(run.id));
    } catch (e) {
      setError(describe(e));
      setBusy(false);
    }
  }

  const blocked = busy || !kit || missing > 0;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={kit} onValueChange={setKit}>
          <SelectTrigger aria-label="Deploy kit" className="w-40" />
          <SelectContent>
            {kits.map((name, i) => (
              <SelectItem key={name} index={i} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={version} onValueChange={setVersion}>
          <SelectTrigger aria-label="Version" className="w-44" />
          <SelectContent>
            {[LATEST, ...versions].map((name, i) => (
              <SelectItem key={name} index={i} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="secondary"
          leadingIcon={PlanIcon}
          disabled={blocked}
          onClick={() => deploy("plan")}
        >
          Plan
        </Button>
        <Button
          leadingIcon={DeployIcon}
          disabled={blocked}
          onClick={() => deploy("apply")}
        >
          Deploy {at.environment}
        </Button>
      </div>
      {missing > 0 && (
        <p className="text-caption text-muted-foreground">
          Supply every missing value before deploying.
        </p>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
