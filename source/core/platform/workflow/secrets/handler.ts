import * as Core from "@ensemble/core";
import * as Workflow from "@ensemble/workflow";
import type { ContextSecretFile } from "@ensemble/workflow";
import { parse as parseYaml, stringify as stringifyYaml } from "@std/yaml";
import { isAuthorizedFor } from "../../auth/tokens.ts";
import {
  isSetSecretFileRequest,
  isSetSecretRequest,
  noWriteAccessMessage,
  type FileSummary,
  type ContextSummaryResponse,
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
    return { workflowName: Core.Workflows.decodeWorkflowId(id), context };
  } catch (error) {
    return {
      errorResponse: Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 }),
    };
  }
}

/** The store/provider instances the secrets editor's handlers are constructed with. */
export interface SecretsStores {
  repositories: Core.GitRepositories.GitRepositoryStore;
  links: Core.GitRepositories.WorkflowGitLinkStore;
  git: Core.GitWrite.GitWriteProvider;
}

/**
 * HTTP handlers for /v1/secrets/*, constructor-injected with the stores and
 * GitWriteProvider they operate on. Only workflows with a WorkflowGitLink
 * (created/synced from a registered git repo) get a working editor here; see
 * resolveGitTarget for the local-only fallback message. Committing goes
 * through the injected GitWriteProvider (currently GitHub's Contents API,
 * see @ensemble/core's git-write.ts) rather than the read-side sparse clone
 * git-integration.ts already uses — kept behind that interface so a future
 * non-GitHub host is a new implementation, not a rearchitecture.
 */
export class SecretsHandlers {
  private readonly repositories: Core.GitRepositories.GitRepositoryStore;
  private readonly links: Core.GitRepositories.WorkflowGitLinkStore;
  private readonly git: Core.GitWrite.GitWriteProvider;

  constructor(stores: SecretsStores) {
    this.repositories = stores.repositories;
    this.links = stores.links;
    this.git = stores.git;
  }

  /** Responds 401 if `request` isn't authorized for `scope`, otherwise undefined. */
  private async requireAuth(
    request: Request,
    scope: "read" | "upload",
  ): Promise<Response | undefined> {
    if (await isAuthorizedFor(request, scope)) return undefined;
    return Response.json({ error: "Missing or invalid bearer token." }, {
      status: 401,
    });
  }

  /** Parses `request`'s body as JSON, or an error Response if it isn't valid JSON. */
  private async parseJsonBody(
    request: Request,
  ): Promise<{ body: unknown } | { errorResponse: Response }> {
    const text = await request.text();
    try {
      return { body: JSON.parse(text) };
    } catch {
      return {
        errorResponse: Response.json({
          error: "Request body must be valid JSON.",
        }, { status: 400 }),
      };
    }
  }

  /**
   * Resolves the git repo + secrets.yml path a workflow's secrets live at, or
   * an error Response if the workflow has no WorkflowGitLink — only
   * git-linked workflows get a working dashboard secrets editor (a local-only
   * workflow's secrets are edited via `ens workflow secrets edit` instead, see
   * apps/cli/commands/workflow.ts — same file format either way).
   */
  private async resolveGitTarget(
    workflowName: string,
    context: string,
  ): Promise<
    {
      repoUrl: string;
      auth: Core.GitRepositories.GitAuthStrategy;
      secretsPath: string;
      secretsDir: string;
      workflowYmlPath: string;
    } | { errorResponse: Response }
  > {
    const link = await this.links.get(workflowName);
    if (!link) {
      return {
        errorResponse: Response.json({
          error:
            `Workflow "${workflowName}" isn't linked to a git repository — edit its secrets locally via "ens workflow secrets edit".`,
        }, { status: 404 }),
      };
    }
    const record = await this.repositories.get(link.projectName);
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
      secretsPath: `${workflowRoot}/contexts/${context}/secrets.yml`,
      secretsDir: `${workflowRoot}/contexts/${context}/secrets`,
      workflowYmlPath: `${workflowRoot}/workflow.yml`,
    };
  }

  /**
   * Fetches and parses this workflow's own workflow.yml to read its declared
   * context.secrets.files entries — empty if the file can't be found or
   * doesn't parse (a workflow declaring no file secrets is the common case,
   * not an error state).
   */
  private async readDeclaredSecretFiles(
    repoUrl: string,
    auth: Core.GitRepositories.GitAuthStrategy,
    workflowYmlPath: string,
  ): Promise<ContextSecretFile[]> {
    try {
      const bytes = await this.git.getFile(repoUrl, auth, workflowYmlPath);
      if (bytes === undefined) return [];
      const workflow = Workflow.Parse.parseWorkflowText(
        workflowYmlPath,
        new TextDecoder().decode(bytes),
      );
      return workflow.context?.secrets?.files ?? [];
    } catch {
      return [];
    }
  }

  private async readSecretsMap(
    repoUrl: string,
    auth: Core.GitRepositories.GitAuthStrategy,
    path: string,
  ): Promise<Record<string, string>> {
    const content = await this.git.getFile(repoUrl, auth, path);
    if (content === undefined) return {};
    const parsed = parseYaml(new TextDecoder().decode(content));
    if (parsed === null || parsed === undefined) return {};
    return parsed as Record<string, string>;
  }

  /** Reads/validates the common :workflowId/:context/:name route params for a file-secret request, resolving `:name` against the workflow's declared context.secrets.files entries. */
  private async resolveDeclaredSecretFile(
    target: {
      repoUrl: string;
      auth: Core.GitRepositories.GitAuthStrategy;
      workflowYmlPath: string;
    },
    workflowName: string,
    name: string,
  ): Promise<ContextSecretFile | { errorResponse: Response }> {
    const declared = await this.readDeclaredSecretFiles(
      target.repoUrl,
      target.auth,
      target.workflowYmlPath,
    );
    const entry = declared.find((e) => e.name === name);
    if (!entry) {
      return {
        errorResponse: Response.json({
          error:
            `Workflow "${workflowName}" declares no context.secrets.files entry named "${name}".`,
        }, { status: 400 }),
      };
    }
    return entry;
  }

  /** GET /v1/secrets/:workflowId/:context — key names only, never values. */
  async handleGetContext(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "read");
    if (authError) return authError;
    const resolved = resolveParams(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;

    const target = await this.resolveGitTarget(
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
      const secrets = await this.readSecretsMap(
        target.repoUrl,
        target.auth,
        target.secretsPath,
      );
      const keys = Object.keys(secrets).sort().map((key) => ({ key }));

      const declaredFiles = await this.readDeclaredSecretFiles(
        target.repoUrl,
        target.auth,
        target.workflowYmlPath,
      );
      const files: FileSummary[] = [];
      for (const entry of declaredFiles) {
        const content = await this.git.getFile(
          target.repoUrl,
          target.auth,
          `${target.secretsDir}/${entry.path}.enc`,
        );
        files.push({ name: entry.name, isSet: content !== undefined });
      }

      return Response.json(
        { keys, files } satisfies ContextSummaryResponse,
      );
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 });
    }
  }

  /**
   * POST /v1/secrets/:workflowId/:context/:key/set — encrypts `value` with the
   * repo's own committed public key (.ensemble/secrets.key.pub) and commits
   * the updated contexts/<context>/secrets.yml via the GitWriteProvider. The
   * server never holds or needs the private key for this — only the public
   * key, which travels with the repo, so this path never decrypts anything.
   */
  async handleSetSecret(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "upload");
    if (authError) return authError;
    const resolved = resolveParams(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;
    const key = params.key;
    if (!key) {
      return Response.json({ error: "Missing key in URL." }, { status: 400 });
    }

    const parsed = await this.parseJsonBody(request);
    if ("errorResponse" in parsed) return parsed.errorResponse;
    if (!isSetSecretRequest(parsed.body)) {
      return Response.json({ error: "Expected { value: string }." }, {
        status: 400,
      });
    }
    const body = parsed.body;

    const target = await this.resolveGitTarget(
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
      const publicKeyBytes = await this.git.getFile(
        target.repoUrl,
        target.auth,
        Workflow.SecretsCrypto.SECRETS_PUBLIC_KEY_PATH,
      );
      if (publicKeyBytes === undefined) {
        return Response.json({
          error:
            `No ${Workflow.SecretsCrypto.SECRETS_PUBLIC_KEY_PATH} found in the repository — run "ens workflow secrets init" and commit it first.`,
        }, { status: 400 });
      }
      const publicKey = new TextDecoder().decode(publicKeyBytes).trim();

      const secrets = await this.readSecretsMap(
        target.repoUrl,
        target.auth,
        target.secretsPath,
      );
      secrets[key] = await Workflow.SecretsCrypto.encryptValue(publicKey, body.value);

      const { commitSha } = await this.git.putFile(
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
  async handleDelete(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "upload");
    if (authError) return authError;
    const resolved = resolveParams(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;
    const key = params.key;
    if (!key) {
      return Response.json({ error: "Missing key in URL." }, { status: 400 });
    }

    const target = await this.resolveGitTarget(
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
      const secrets = await this.readSecretsMap(
        target.repoUrl,
        target.auth,
        target.secretsPath,
      );
      if (!Object.hasOwn(secrets, key)) {
        return Response.json({});
      }
      delete secrets[key];

      await this.git.putFile(
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

  /**
   * POST /v1/secrets/:workflowId/:context/:name/set-file — encrypts the
   * uploaded file's bytes with the repo's own committed public key and
   * commits it to contexts/<context>/secrets/<declared path>.enc. `:name`
   * must match a context.secrets.files entry the workflow already declares
   * in its workflow.yml — there's no ad-hoc file-secret naming the way
   * context.secrets.variables allows for value secrets.
   */
  async handleSetSecretFile(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "upload");
    if (authError) return authError;
    const resolved = resolveParams(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;
    const name = params.name;
    if (!name) {
      return Response.json({ error: "Missing name in URL." }, { status: 400 });
    }

    const parsed = await this.parseJsonBody(request);
    if ("errorResponse" in parsed) return parsed.errorResponse;
    if (!isSetSecretFileRequest(parsed.body)) {
      return Response.json({ error: "Expected { contentBase64: string }." }, {
        status: 400,
      });
    }
    const body = parsed.body;

    const target = await this.resolveGitTarget(
      resolved.workflowName,
      resolved.context,
    );
    if ("errorResponse" in target) return target.errorResponse;

    if (target.auth.type !== "pat") {
      return Response.json({
        error: noWriteAccessMessage(resolved.workflowName),
      }, { status: 400 });
    }

    const entry = await this.resolveDeclaredSecretFile(
      target,
      resolved.workflowName,
      name,
    );
    if ("errorResponse" in entry) return entry.errorResponse;

    try {
      const publicKeyBytes = await this.git.getFile(
        target.repoUrl,
        target.auth,
        Workflow.SecretsCrypto.SECRETS_PUBLIC_KEY_PATH,
      );
      if (publicKeyBytes === undefined) {
        return Response.json({
          error:
            `No ${Workflow.SecretsCrypto.SECRETS_PUBLIC_KEY_PATH} found in the repository — run "ens workflow secrets init" and commit it first.`,
        }, { status: 400 });
      }
      const publicKey = new TextDecoder().decode(publicKeyBytes).trim();

      const plaintext = Uint8Array.from(
        atob(body.contentBase64),
        (c) => c.charCodeAt(0),
      );
      const encrypted = await Workflow.SecretsCrypto.encryptFile(publicKey, plaintext);

      const { commitSha } = await this.git.putFile(
        target.repoUrl,
        target.auth,
        `${target.secretsDir}/${entry.path}.enc`,
        encrypted,
        `Update file secret "${name}" for ${resolved.context}`,
        { name: "ensemble", email: "ensemble@users.noreply.github.com" },
      );
      return Response.json({ commitSha } satisfies SetSecretResponse);
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 });
    }
  }

  /** POST /v1/secrets/:workflowId/:context/:name/delete-file */
  async handleDeleteFile(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "upload");
    if (authError) return authError;
    const resolved = resolveParams(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;
    const name = params.name;
    if (!name) {
      return Response.json({ error: "Missing name in URL." }, { status: 400 });
    }

    const target = await this.resolveGitTarget(
      resolved.workflowName,
      resolved.context,
    );
    if ("errorResponse" in target) return target.errorResponse;

    if (target.auth.type !== "pat") {
      return Response.json({
        error: noWriteAccessMessage(resolved.workflowName),
      }, { status: 400 });
    }

    const entry = await this.resolveDeclaredSecretFile(
      target,
      resolved.workflowName,
      name,
    );
    if ("errorResponse" in entry) return entry.errorResponse;

    try {
      await this.git.deleteFile(
        target.repoUrl,
        target.auth,
        `${target.secretsDir}/${entry.path}.enc`,
        `Remove file secret "${name}" from ${resolved.context}`,
        { name: "ensemble", email: "ensemble@users.noreply.github.com" },
      );
      return Response.json({});
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 });
    }
  }
}
