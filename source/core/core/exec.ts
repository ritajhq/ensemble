import { Project } from "./ecosystem/index.ts";
import type { Ports } from "./ports.ts";

/** Brings every ecosystem's generated files in line with the packages on disk (`ens sync`). */
export async function runSync(ports: Ports): Promise<void> {
  const repoRoot = await ports.repo.findRepoRoot();
  await (await Project.load(repoRoot, ports)).sync();
}

/** Runs a language's own tool against this project's hidden root files (`ens exec deno test source/core`), returning its exit code. */
export async function runExec(
  tool: string,
  args: readonly string[],
  ports: Ports,
): Promise<number> {
  const repoRoot = await ports.repo.findRepoRoot();
  const project = await Project.load(repoRoot, ports);
  await project.sync();
  const invocation = await project.invocation(tool, args);
  return await ports.process.run(tool, invocation.args, {
    cwd: invocation.cwd,
  });
}
