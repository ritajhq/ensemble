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
import { useLoaderData } from "react-router";
import {
  describe,
  type GithubApp,
  type GithubOwner,
  type GithubSetup,
} from "../api.ts";
import { useApi } from "../api-provider.tsx";
import { Notice } from "../components/notice.tsx";
import { Panel } from "../components/panel.tsx";
import type { GithubData } from "../routes.tsx";

/** Who an app can be created under, as the setup offers it. */
const OWNERS: readonly { value: GithubOwner; label: string }[] = [
  { value: "organization", label: "An organization" },
  { value: "user", label: "My account" },
];

/** A name for the app no other app has taken — GitHub App names are unique across GitHub — so each account's app gets its own: named after the organization, and this platform's host. */
function suggestedName(organization: string): string {
  const host = location.hostname.replace(/\./g, "-");
  const parts = ["ensemble", organization.trim(), host].filter(Boolean);
  return parts.join("-").slice(0, 34).replace(/-+$/, "");
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

/** The platform's GitHub Apps — one per account it reaches repositories under — and setting up another. */
export function Github() {
  const { apps } = useLoaderData() as GithubData;
  return (
    <>
      {apps.length > 0 && <Apps apps={apps} />}
      <NewApp first={apps.length === 0} />
    </>
  );
}

/** The apps there are, each with where to install it on more repositories. */
function Apps({ apps }: { apps: readonly GithubApp[] }) {
  const InstallIcon = useIcon("arrow-right");
  return (
    <Panel
      title="GitHub Apps"
      description="The platform reaches GitHub as these apps: each releases and deploys the repositories it's installed on, and hears of every push to them. A private app installs on its owner's repositories alone."
    >
      <div className="grid gap-2">
        {apps.map((app) => (
          <div
            key={app.id}
            className="flex flex-wrap items-center gap-2 text-body"
          >
            <a
              className="font-medium underline"
              href={app.htmlUrl}
              target="_blank"
              rel="noreferrer"
            >
              {app.slug}
            </a>
            <span className="text-muted-foreground">owned by {app.owner}</span>
            <Button
              className="ml-auto"
              variant="secondary"
              trailingIcon={InstallIcon}
              onClick={() => open(app.installUrl, "_blank", "noreferrer")}
            >
              Install on repositories
            </Button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Creates another app, under the operator's account or an organization, on GitHub. */
function NewApp({ first }: { first: boolean }) {
  const api = useApi();
  const [owner, setOwner] = useState<GithubOwner>("organization");
  const [organization, setOrganization] = useState("");
  // Left empty, the app takes the suggested name: it follows the organization.
  const [name, setName] = useState("");
  const appName = name.trim() ||
    suggestedName(owner === "organization" ? organization : "");
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
          name: appName,
        }),
      );
    } catch (e) {
      setError(describe(e));
      setBusy(false);
    }
  }

  return (
    <Panel
      title={first ? "Connect GitHub" : "Add a GitHub App"}
      description={first
        ? "The platform reaches GitHub as a GitHub App of its own: create it under an account, then install it on the repositories to release and deploy. GitHub asks you to confirm both."
        : "For repositories under another account — an organization of yours — create an app owned by it. GitHub App names are unique across GitHub."}
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
              placeholder={appName}
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
            disabled={busy ||
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
