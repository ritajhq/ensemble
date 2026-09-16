import { join } from "@std/path";
import { $ } from "@david/dax";
import type { Vendor } from "@ensemble/core";

/** The real `PackageSource` — shells out to the `git` and `gh` CLIs. */
export class GitPackageSource implements Vendor.PackageSource {
  async fetch(
    location: string,
    ref: string | undefined,
    into: string,
  ): Promise<void> {
    await $`git clone --quiet ${location} ${into}`;
    if (ref) await $`git checkout --quiet ${ref}`.cwd(into);
  }

  async currentRef(dir: string): Promise<string> {
    return (await $`git rev-parse HEAD`.cwd(dir).text()).trim();
  }

  async flattenHistory(dir: string): Promise<void> {
    await Deno.remove(join(dir, ".git"), { recursive: true }).catch(() => {});
    await $`git init -q`.cwd(dir);
    await $`git add -A`.cwd(dir);
    await $`git commit -q -m "Initial commit"`.cwd(dir);
  }

  async publishTo(dir: string, location: string): Promise<string> {
    await $`git remote add origin ${location}`.cwd(dir);
    await $`git push --quiet origin HEAD`.cwd(dir);
    return await this.currentRef(dir);
  }

  async proposeChange(dir: string): Promise<Vendor.PullRequestRef> {
    const branch = (await $`git branch --show-current`.cwd(dir).text()).trim();
    await $`git push --quiet origin ${branch}`.cwd(dir);
    const url = (await $`gh pr create --fill --head ${branch}`.cwd(dir).text())
      .trim();
    return { url };
  }

  async switchTo(dir: string, ref: string): Promise<void> {
    await $`git fetch --quiet origin`.cwd(dir);
    await $`git checkout --quiet ${ref}`.cwd(dir);
  }

  async availableVersions(location: string): Promise<string[]> {
    const output = await $`git ls-remote --tags --refs ${location}`.text();
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.split("refs/tags/")[1])
      .filter((tag): tag is string => tag !== undefined);
  }
}
