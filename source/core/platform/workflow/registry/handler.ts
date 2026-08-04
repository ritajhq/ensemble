import { dirname, join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { decodeWorkflowId, findRepoRoot } from "@ensemble/core";
import { parseWorkflowFile } from "@ensemble/workflow";
import { isAuthorizedFor } from "../../auth/tokens.ts";
import { extractTarGz } from "./extract.ts";

async function removeIfExists(path: string): Promise<void> {
  await Deno.remove(path, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });
}

/**
 * PUT /v1/workflows/:id — uploads a .tar.gz of a workflow's whole directory
 * tree (workflow.yml, steps/, optionally its own deno.json — see the
 * "full-fledged deno project" script contract), replacing whatever's
 * currently at workflows/<name>. Extracted into a staging directory first
 * and validated via parseWorkflowFile before ever touching the live
 * directory, so an invalid or malformed upload can't leave a broken
 * workflow in place.
 */
export async function handleUploadWorkflow(
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "upload")) {
    return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
  }

  const id = params.id;
  if (!id) {
    return Response.json({ error: "Missing workflow id in URL." }, { status: 400 });
  }
  let name: string;
  try {
    name = decodeWorkflowId(id);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
  if (!request.body) {
    return Response.json({ error: "Expected a tar.gz request body." }, { status: 400 });
  }

  const repoRoot = await findRepoRoot();
  const workflowsDir = join(repoRoot, "workflows");
  const targetDir = join(workflowsDir, name);
  // Flat uuid-only staging name — `name` may itself contain "/" (a nested
  // layout, e.g. "ensemble/server"), which can't be embedded in a single
  // path segment the way a flat name could.
  const stagingDir = join(workflowsDir, `.upload-${crypto.randomUUID()}`);

  try {
    await extractTarGz(request.body, stagingDir);
  } catch (error) {
    await removeIfExists(stagingDir);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }

  try {
    await parseWorkflowFile(join(stagingDir, "workflow.yml"));
  } catch (error) {
    await removeIfExists(stagingDir);
    return Response.json(
      { error: `Uploaded archive's workflow.yml is invalid: ${error instanceof Error ? error.message : error}` },
      { status: 400 },
    );
  }

  if (await exists(targetDir)) {
    await removeIfExists(targetDir);
  }
  await ensureDir(dirname(targetDir));
  await Deno.rename(stagingDir, targetDir);

  return Response.json({ success: true });
}
