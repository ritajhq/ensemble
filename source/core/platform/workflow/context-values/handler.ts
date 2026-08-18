import {
  decodeWorkflowId,
  type GitRepositoryStore,
  type GitWriteProvider,
  type WorkflowGitLinkStore,
} from "@ensemble/core";
import { type Context, parseWorkflowText } from "@ensemble/workflow";
import { parse as parseYaml } from "@std/yaml";
import { isAuthorizedFor } from "../../auth/tokens.ts";
import type { ContextValuesSummaryResponse } from "./contract.ts";

/** Reads/validates the common :workflowId/:context route params, decoding the base64url workflow id to its real name. */
function resolveParams(
  params: Record<string, string | undefined>,
): { workflowName: string; context: string } | { errorResponse: Response } {
  const id = params.workflowId;
  const context = params.context;
  if (!id || !context) {
    return {
      errorResponse: Response.json({
        error: "Missing workflowId or context in URL.",
      }, { status: 400 }),
    };
  }
  try {
    return { workflowName: decodeWorkflowId(id), context };
  } catch (error) {
    return {
      errorResponse: Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 }),
    };
  }
}

/** Same git target resolution as the secrets editor (see secrets/handler.ts's resolveGitTarget) — only workflows with a WorkflowGitLink expose this dashboard view. */
async function resolveGitTarget(
  repositories: GitRepositoryStore,
  links: WorkflowGitLinkStore,
  workflowName: string,
  context: string,
): Promise<
  {
    repoUrl: string;
    auth: import("@ensemble/core").GitAuthStrategy;
    variablesPath: string;
    workflowYmlPath: string;
  } | { errorResponse: Response }
> {
  const link = await links.get(workflowName);
  if (!link) {
    return {
      errorResponse: Response.json({
        error: `Workflow "${workflowName}" isn't linked to a git repository.`,
      }, { status: 404 }),
    };
  }
  const record = await repositories.get(link.projectName);
  if (!record) {
    return {
      errorResponse: Response.json({
        error: `Registered repository "${link.projectName}" not found.`,
      }, { status: 404 }),
    };
  }
  const workflowRoot = `workflows/${link.pathInRepo}`;
  return {
    repoUrl: record.repoUrl,
    auth: record.auth,
    variablesPath: `${workflowRoot}/contexts/${context}/variables.yml`,
    workflowYmlPath: `${workflowRoot}/workflow.yml`,
  };
}

/** Fetches and parses this workflow's own workflow.yml, or undefined if it can't be found/parsed. */
async function readWorkflow(
  git: GitWriteProvider,
  repoUrl: string,
  auth: import("@ensemble/core").GitAuthStrategy,
  workflowYmlPath: string,
): Promise<Context | undefined> {
  try {
    const bytes = await git.getFile(repoUrl, auth, workflowYmlPath);
    if (bytes === undefined) return undefined;
    const workflow = parseWorkflowText(
      workflowYmlPath,
      new TextDecoder().decode(bytes),
    );
    return workflow.context;
  } catch {
    return undefined;
  }
}

/** Reads `contexts/<context>/variables.yml` — a plaintext `KEY: value` map, same convention as context-loaders/local.ts's createLocalLoader, just fetched from git instead of disk. */
async function readVariablesMap(
  git: GitWriteProvider,
  repoUrl: string,
  auth: import("@ensemble/core").GitAuthStrategy,
  path: string,
): Promise<Record<string, string>> {
  const content = await git.getFile(repoUrl, auth, path);
  if (content === undefined) return {};
  const parsed = parseYaml(new TextDecoder().decode(content));
  if (parsed === null || parsed === undefined) return {};
  return parsed as Record<string, string>;
}

/** GET /v1/context-values/:workflowId/:context — resolved variable values (variables.yml, falling back to workflow.yml's own inline value/default) and declared file paths. Read-only, plaintext by design — never used for secrets. */
export async function handleGetContextValues(
  repositories: GitRepositoryStore,
  links: WorkflowGitLinkStore,
  git: GitWriteProvider,
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "read")) {
    return Response.json({ error: "Missing or invalid bearer token." }, {
      status: 401,
    });
  }
  const resolved = resolveParams(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;

  const target = await resolveGitTarget(
    repositories,
    links,
    resolved.workflowName,
    resolved.context,
  );
  if ("errorResponse" in target) return target.errorResponse;

  try {
    const context = await readWorkflow(
      git,
      target.repoUrl,
      target.auth,
      target.workflowYmlPath,
    );

    const resolvedValues = await readVariablesMap(
      git,
      target.repoUrl,
      target.auth,
      target.variablesPath,
    );

    const variables = (context?.variables ?? []).map((declared) => ({
      name: declared.name,
      value: declared.value ?? resolvedValues[declared.name] ??
        declared.default,
    }));

    const files = (context?.files ?? []).map((declared) => ({
      name: declared.name,
      path: declared.path,
    }));

    return Response.json(
      { variables, files } satisfies ContextValuesSummaryResponse,
    );
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 400 });
  }
}
