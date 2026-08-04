import { extname, join, normalize } from "@std/path";
import { contentType } from "@std/media-types";
import { findRepoRoot } from "@ensemble/core";

async function readFile(path: string): Promise<Response | undefined> {
  try {
    const file = await Deno.readFile(path);
    const type = contentType(extname(path)) ?? "application/octet-stream";
    return new Response(file, { headers: { "content-type": type } });
  } catch {
    return undefined;
  }
}

export async function handleDashboardStatic(request: Request): Promise<Response> {
  const repoRoot = await findRepoRoot();
  const root = join(repoRoot, "source", "artifacts", "web");

  const url = new URL(request.url);
  const relativePath = normalize(url.pathname === "/" ? "/index.html" : url.pathname);
  if (relativePath.startsWith("..")) return new Response("Not found", { status: 404 });

  const filePath = join(root, relativePath);
  const asset = await readFile(filePath);
  if (asset) return asset;

  const index = await readFile(join(root, "index.html"));
  if (index) return index;

  return new Response("Dashboard not built — run `ens build web`.", { status: 404 });
}
