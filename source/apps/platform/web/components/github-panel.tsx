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
import { describe, type GithubOwner, type GithubSetup } from "../api.ts";
import { useApi } from "../api-provider.tsx";
import { useLoad } from "../use-load.ts";
import { Notice } from "./notice.tsx";
import { Panel } from "./panel.tsx";

/** Who an app can be created under, as the setup offers it. */
const OWNERS: readonly { value: GithubOwner; label: string }[] = [
  { value: "organization", label: "An organization" },
  { value: "user", label: "My account" },
];

/** A name for the app no other platform's has taken: GitHub App names are unique across GitHub. */
function suggestedName(): string {
  return `ensemble-${location.hostname.replace(/\./g, "-")}`.slice(0, 34);
}

/**
 * Sends the operator's browser to GitHub with the app's manifest: a real
 * form post, which GitHub answers by asking them to confirm, creating the
 * app, and sending them back to the platform.
 */
function postToGithub(setup: GithubSetup): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = setup.action;
  const manifest = document.createElement("input");
  manifest.type = "hidden";
  manifest.name = "manifest";
  manifest.value = setup.manifest;
  form.append(manifest);
  document.body.append(form);
  form.submit();
}

/** The platform's GitHub App: setting it up the first time, then where it's installed on more repositories. */
export function GithubPanel() {
  const api = useApi();
  const github = useLoad(() => api.github(), []);
  const [owner, setOwner] = useState<GithubOwner>("organization");
  const [organization, setOrganization] = useState("");
  const [name, setName] = useState(suggestedName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const GithubIcon = useIcon("arrow-right");

  async function begin() {
    setBusy(true);
    setError(undefined);
    try {
      postToGithub(
        await api.beginGithubSetup({
          owner,
          organization: organization.trim(),
          name: name.trim(),
        }),
      );
    } catch (e) {
      setError(describe(e));
      setBusy(false);
    }
  }

  if (github.loading && !github.value) return null;
  if (github.error) {
    return (
      <Panel title="GitHub">
        <Notice tone="error">{github.error}</Notice>
      </Panel>
    );
  }

  const app = github.value?.app;
  if (app) {
    return (
      <Panel
        title="GitHub"
        description={
          <>
            The platform reaches GitHub as{" "}
            <a
              className="underline"
              href={app.htmlUrl}
              target="_blank"
              rel="noreferrer"
            >
              {app.slug}
            </a>
            , owned by{" "}
            {app.owner}: it releases and deploys the repositories it's installed
            on, and hears of every push to them.
          </>
        }
        action={
          <Button
            variant="secondary"
            trailingIcon={GithubIcon}
            onClick={() => open(app.installUrl, "_blank", "noreferrer")}
          >
            Install on more repositories
          </Button>
        }
      />
    );
  }

  return (
    <Panel
      title="Connect GitHub"
      description="The platform reaches GitHub as a GitHub App of its own: create it under an account, then install it on the repositories to release and deploy. GitHub asks you to confirm both."
    >
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          begin();
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={owner}
            onValueChange={(value) => setOwner(value as GithubOwner)}
          >
            <SelectTrigger aria-label="Owner" className="w-48" />
            <SelectContent>
              {OWNERS.map((option, i) => (
                <SelectItem key={option.value} index={i} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <InputGroup className="min-w-0 flex-1">
            {owner === "organization" && (
              <InputField
                index={0}
                label="Organization"
                placeholder="ritajhq"
                value={organization}
                onChange={setOrganization}
              />
            )}
            <InputField
              index={1}
              label="App name"
              placeholder={suggestedName()}
              value={name}
              onChange={setName}
            />
          </InputGroup>
        </div>
        <div>
          <Button
            type="submit"
            trailingIcon={GithubIcon}
            loading={busy}
            disabled={busy || !name.trim() ||
              (owner === "organization" && !organization.trim())}
          >
            Continue on GitHub
          </Button>
        </div>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
    </Panel>
  );
}
