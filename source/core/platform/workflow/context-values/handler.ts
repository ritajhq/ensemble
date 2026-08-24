import * as Core from "@ensemble/core";
import * as Workflow from "@ensemble/workflow";
import type { Context } from "@ensemble/workflow";
import { parse as parseYaml } from "@std/yaml";
import { requireAuth } from "../../features.ts";
import { resolveContextParams, resolveWorkflowGitTarget } from "../git-target.ts";
import type { SummaryResponse } from "./contract.ts";

/** Fetches and parses this workflow's own workflow.yml, or undefined if it can't be found/parsed. */
async function readWorkflow(
  git: Core.GitWrite.GitWriteProvider,
  repoUrl: string,
  auth: Core.GitRepositories.GitAuthStrategy,
  workflowYmlPath: string,
): Promise<Context | undefined> {
  try {
    const bytes = await git.getFile(repoUrl, auth, workflowYmlPath);
    if (bytes === undefined) return undefined;
    const workflow = Workflow.Parse.parseWorkflowText(
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
  git: Core.GitWrite.GitWriteProvider,
  repoUrl: string,
  auth: Core.GitRepositories.GitAuthStrategy,
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
  repositories: Core.GitRepositories.GitRepositoryStore,
  links: Core.GitRepositories.WorkflowGitLinkStore,
  git: Core.GitWrite.GitWriteProvider,
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  const authError = await requireAuth(request, "read");
  if (authError) return authError;
  const resolved = resolveContextParams(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;

  const target = await resolveWorkflowGitTarget(repositories, links, resolved.workflowName);
  if ("errorResponse" in target) return target.errorResponse;

  const variablesPath = `${target.workflowRoot}/contexts/${resolved.context}/variables.yml`;

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
      variablesPath,
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
      { variables, files } satisfies SummaryResponse,
    );
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 400 });
  }
}
