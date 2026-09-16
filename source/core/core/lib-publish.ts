import { join } from "@std/path";
import { findRepoRoot } from "./repo.ts";
import { SelfContainmentChecker } from "./lib-self-containment.ts";
import { LibDeclarationLoader } from "./lib-declaration.ts";
import { LibKit } from "./lib-kit.ts";
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
    private readonly libKitFor: (kit: string) => LibKit = (kit) =>
      new LibKit(kit),
    private readonly warn: (message: string) => void = (message) =>
      console.warn(message),
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

    const declaration = await this.declarationLoader.load(libRoot);
    const publishEntry = declaration.publish.find((entry) => entry.kit === kit);
    if (!publishEntry) {
      throw new Error(
        `"${name}" doesn't declare a "${kit}" entry under "publish" in its lib.yml.`,
      );
    }

    const context = {
      libRoot,
      package: declaration.package,
      version,
      target: publishEntry.target,
    };
    const libKit = this.libKitFor(kit);
    await libKit.stamp(context);
    await libKit.publish(context);
  }
}

/** Publishes a libs library (`ens lib publish <name> <kit> <version>`) — thin wiring over `LibPublisher`. */
export async function runLibPublish(
  name: string,
  kit: string,
  version: string,
): Promise<void> {
  const repoRoot = await findRepoRoot();
  const checker = new SelfContainmentChecker(repoRoot);
  const registry = new Vendor.FileRegistry(repoRoot);
  const declarationLoader = new LibDeclarationLoader(repoRoot);
  const publisher = new LibPublisher(
    repoRoot,
    checker,
    registry,
    declarationLoader,
  );
  await publisher.publish(name, kit, version);
}
