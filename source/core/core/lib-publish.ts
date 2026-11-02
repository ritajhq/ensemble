import { join } from "@std/path";
import { SelfContainmentChecker } from "./lib-self-containment.ts";
import { DenoWorkspace, type Ecosystem, Project } from "./ecosystem/index.ts";
import { LibDeclarationLoader } from "./lib-declaration.ts";
import { LibKit } from "./lib-kit.ts";
import type { Ports } from "./ports.ts";
import { PublishUnauthorizedError } from "./publish-authorization.ts";
import * as Vendor from "./vendor/index.ts";

/**
 * Publishes one libs library through one of its declared kits, entirely
 * outside `ens release` (core libraries ride that cascade instead — Section
 * 9 of the vendoring build plan). Unlike core libraries, the self-
 * containment check runs here unconditionally, on every publish, regardless
 * of whether the library has ever been ejected — ejection status only ever
 * gates the warning below, never the check itself.
 */
export class LibPublisher {
  constructor(
    private readonly repoRoot: string,
    private readonly checker: SelfContainmentChecker,
    private readonly registry: Vendor.Registry,
    private readonly declarationLoader: LibDeclarationLoader,
    private readonly ports: Ports,
    private readonly libKitFor: (kit: string) => LibKit = (kit) =>
      new LibKit(kit, ports),
    private readonly warn: (message: string) => void = (message) =>
      console.warn(message),
    private readonly ecosystem: Ecosystem = new DenoWorkspace(repoRoot),
  ) {}

  async publish(name: string, kit: string, version: string): Promise<void> {
    const relativePath = join("source", "libs", name);
    const libRoot = join(this.repoRoot, relativePath);

    const violations = await this.checker.check(libRoot);
    if (violations.length > 0) {
      const details = violations.map((violation) =>
        `  - ${violation.importSpecifier}: ${violation.reason}`
      ).join(
        "\n",
      );
      throw new Error(
        `"${name}" isn't self-contained enough to publish:\n${details}`,
      );
    }

    const vendored = await this.registry.entryFor(relativePath);
    if (!vendored) {
      this.warn(
        `"${name}" hasn't been ejected yet — publishing directly from this monorepo checkout. ` +
          `Consider "ens lib eject ${name} --remote <url>" first.`,
      );
    }

    const declaration = await this.declarationLoader.load(name);
    const publishEntry = declaration.publish.find((entry) => entry.kit === kit);
    if (!publishEntry) {
      throw new Error(
        `"${name}" doesn't declare a "${kit}" entry under "publish" in .ensemble/config.yaml.`,
      );
    }

    const context = {
      libRoot,
      package: declaration.package,
      version,
      target: publishEntry.target,
    };
    const libKit = this.libKitFor(kit);
    const authorization = await libKit.authorize(context);
    if (!authorization.granted) {
      throw new PublishUnauthorizedError([{
        publish: `${declaration.package} → ${kit}`,
        reason: authorization.reason ?? "refused",
      }]);
    }
    // Ahead of the kit's own stamp, so nothing in the workspace is left pinned
    // to a version its target no longer carries: Cargo refuses to resolve such
    // a workspace at all, and Deno would quietly stop linking it locally.
    await this.ecosystem.stamp(version, [{
      name: declaration.package,
      directory: libRoot,
    }]);
    await libKit.stamp(context);
    await libKit.publish(context);
  }
}

/** Publishes a libs library (`ens lib publish <name> <kit> <version>`) — thin wiring over `LibPublisher`. */
export async function runLibPublish(
  name: string,
  kit: string,
  version: string,
  ports: Ports,
): Promise<void> {
  const repoRoot = await ports.repo.findRepoRoot();
  const project = await Project.load(repoRoot, ports);
  const checker = new SelfContainmentChecker(repoRoot, project);
  const registry = new Vendor.FileRegistry(repoRoot);
  const declarationLoader = new LibDeclarationLoader(repoRoot);
  const publisher = new LibPublisher(
    repoRoot,
    checker,
    registry,
    declarationLoader,
    ports,
    undefined,
    undefined,
    project,
  );
  await publisher.publish(name, kit, version);
}
