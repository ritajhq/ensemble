import {
  decodeWorkflowId,
  type GitRepositoryStore,
  type GitWriteProvider,
  type WorkflowGitLinkStore,
} from "@ensemble/core";
import { encryptValue, SECRETS_PUBLIC_KEY_PATH } from "@ensemble/workflow";
import { parse as parseYaml, stringify as stringifyYaml } from "@std/yaml";
import { isAuthorizedFor } from "../../auth/tokens.ts";
import {
  isSetSecretRequest,
  noWriteAccessMessage,
  type SecretsContextSummaryResponse,
  type SetSecretResponse,
} from "./contract.ts";

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

/**
 * Resolves the git repo + secrets.enc path a workflow's secrets live at, or
 * an error Response if the workflow has no WorkflowGitLink — only
 * git-linked workflows get a working dashboard secrets editor (a local-only
 * workflow's secrets are edited via `ens workflow secrets edit` instead, see
 * apps/cli/commands/workflow.ts — same file format either way).
 */
async function resolveGitTarget(
  repositories: GitRepositoryStore,
  links: WorkflowGitLinkStore,
  workflowName: string,
  context: string,
): Promise<
  {
    repoUrl: string;
    auth: import("@ensemble/core").GitAuthStrategy;
    secretsPath: string;
  } | { errorResponse: Response }
> {
  const link = await links.get(workflowName);
  if (!link) {
    return {
      errorResponse: Response.json({
        error:
          `Workflow "${workflowName}" isn't linked to a git repository — edit its secrets locally via "ens workflow secrets edit".`,
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
  const secretsPath =
    `workflows/${link.pathInRepo}/contexts/${context}/secrets.enc`;
  return { repoUrl: record.repoUrl, auth: record.auth, secretsPath };
}

async function readSecretsMap(
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

/** GET /v1/secrets/:workflowId/:context — key names only, never values. */
export async function handleGetSecretsContext(
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

  if (target.auth.type !== "pat") {
    return Response.json({
      error: noWriteAccessMessage(resolved.workflowName),
    }, { status: 400 });
  }

  try {
    const secrets = await readSecretsMap(
      git,
      target.repoUrl,
      target.auth,
      target.secretsPath,
    );
    const keys = Object.keys(secrets).sort().map((key) => ({ key }));
    return Response.json({ keys } satisfies SecretsContextSummaryResponse);
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 400 });
  }
}

/**
 * POST /v1/secrets/:workflowId/:context/:key/set — encrypts `value` with the
 * repo's own committed public key (.ensemble/secrets.key.pub) and commits
 * the updated contexts/<context>/secrets.enc via the GitWriteProvider. The
 * server never holds or needs the private key for this — only the public
 * key, which travels with the repo, so this path never decrypts anything.
 */
export async function handleSetSecret(
  repositories: GitRepositoryStore,
  links: WorkflowGitLinkStore,
  git: GitWriteProvider,
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "upload")) {
    return Response.json({ error: "Missing or invalid bearer token." }, {
      status: 401,
    });
  }
  const resolved = resolveParams(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;
  const key = params.key;
  if (!key) {
    return Response.json({ error: "Missing key in URL." }, { status: 400 });
  }

  const text = await request.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, {
      status: 400,
    });
  }
  if (!isSetSecretRequest(body)) {
    return Response.json({ error: "Expected { value: string }." }, {
      status: 400,
    });
  }

  const target = await resolveGitTarget(
    repositories,
    links,
    resolved.workflowName,
    resolved.context,
  );
  if ("errorResponse" in target) return target.errorResponse;

  if (target.auth.type !== "pat") {
    return Response.json({
      error: noWriteAccessMessage(resolved.workflowName),
    }, { status: 400 });
  }

  try {
    const publicKeyBytes = await git.getFile(
      target.repoUrl,
      target.auth,
      SECRETS_PUBLIC_KEY_PATH,
    );
    if (publicKeyBytes === undefined) {
      return Response.json({
        error:
          `No ${SECRETS_PUBLIC_KEY_PATH} found in the repository — run "ens workflow secrets init" and commit it first.`,
      }, { status: 400 });
    }
    const publicKey = new TextDecoder().decode(publicKeyBytes).trim();

    const secrets = await readSecretsMap(
      git,
      target.repoUrl,
      target.auth,
      target.secretsPath,
    );
    secrets[key] = await encryptValue(publicKey, body.value);

    const { commitSha } = await git.putFile(
      target.repoUrl,
      target.auth,
      target.secretsPath,
      new TextEncoder().encode(stringifyYaml(secrets)),
      `Update secrets for ${resolved.context}`,
      { name: "ensemble", email: "ensemble@users.noreply.github.com" },
    );
    return Response.json({ commitSha } satisfies SetSecretResponse);
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 400 });
  }
}

/** POST /v1/secrets/:workflowId/:context/:key/delete */
export async function handleDeleteSecret(
  repositories: GitRepositoryStore,
  links: WorkflowGitLinkStore,
  git: GitWriteProvider,
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "upload")) {
    return Response.json({ error: "Missing or invalid bearer token." }, {
      status: 401,
    });
  }
  const resolved = resolveParams(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;
  const key = params.key;
  if (!key) {
    return Response.json({ error: "Missing key in URL." }, { status: 400 });
  }

  const target = await resolveGitTarget(
    repositories,
    links,
    resolved.workflowName,
    resolved.context,
  );
  if ("errorResponse" in target) return target.errorResponse;

  if (target.auth.type !== "pat") {
    return Response.json({
      error: noWriteAccessMessage(resolved.workflowName),
    }, { status: 400 });
  }

  try {
    const secrets = await readSecretsMap(
      git,
      target.repoUrl,
      target.auth,
      target.secretsPath,
    );
    if (!Object.hasOwn(secrets, key)) {
      return Response.json({});
    }
    delete secrets[key];

    await git.putFile(
      target.repoUrl,
      target.auth,
      target.secretsPath,
      new TextEncoder().encode(stringifyYaml(secrets)),
      `Remove secret "${key}" from ${resolved.context}`,
      { name: "ensemble", email: "ensemble@users.noreply.github.com" },
    );
    return Response.json({});
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 400 });
  }
}
