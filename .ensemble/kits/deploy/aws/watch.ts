import { dirname, join, relative, SEPARATOR } from "@std/path";
import { ensureDir } from "@std/fs";
import { $ } from "@david/dax";
import * as KitSdk from "@ensemble/kit-sdk";
import {
  DEVELOPMENT_METADATA,
  type DevelopmentSync,
  type SyncRule,
} from "./development-sync.ts";
import { FunctionAdapter } from "./function-adapter.ts";
import { FunctionPackage } from "./function-package.ts";
import { pascalCase } from "./pascal-case.ts";
import { CLOUDFRONT_URL, RouteListing } from "./route-listing.ts";
import { type RoutedTarget, ROUTES_METADATA } from "./routes-metadata.ts";
import { readTemplate, Stack } from "./stack.ts";

// The aws kit's watch (see main.ts's `watchCommand`), what `ens develop` runs:
// the same stack deploy as an apply, then — for as long as the session lasts —
// every resource that declares `development.sync` is kept current straight
// from its apps' build output whenever that output changes, in seconds rather
// than a stack update: a function gets its code replaced (`aws lambda
// update-function-code`), a bucket its contents re-uploaded (`aws s3 sync`)
// and the distributions in front of it invalidated. Neither Lambda nor S3 has
// file watching of its own, AWS's or MiniStack's alike; this is the same loop
// as `sam sync --watch`, so it works against either.
//
// What the developer needs to see — the routes once the stack is up, each
// sync — goes to stderr: a quiet session (`ens develop` without --verbose)
// discards this script's stdout, where the aws CLI's own progress lands.
//
// Usage: watch.ts <template path> <stack name>

/** How long a build output has to stay quiet before it's synced — a rebuild writes the bundle and its source map separately. */
const SETTLE_MS = 300;

/** How often, and how many times, to check a code update has finished: a minute in all. */
const UPDATE_POLL_MS = 250;
const UPDATE_POLLS = 240;

/**
 * `source/artifacts/<app>`, where a build writes its output: the template is
 * always at `<repo>/source/artifacts/deploy/<name>/template.yaml` (`ens
 * deploy`'s own convention, which the compose kit's watch relies on too).
 */
function artifactsDirFor(templatePath: string): string {
  return dirname(dirname(dirname(templatePath)));
}

/** Brings one deployed resource up to date with its apps' build output. */
interface Target {
  readonly logicalId: string;
  readonly rules: readonly SyncRule[];
  update(): Promise<void>;
}

/**
 * Keeps a target in sync: an update once its rules' build output settles
 * after a change, never overlapping — a change landing during one update runs
 * one more after it.
 */
class Syncer {
  private settling?: ReturnType<typeof setTimeout>;
  private updating?: Promise<void>;
  private outdated = false;

  constructor(
    private readonly target: Target,
    private readonly artifactsDir: string,
  ) {}

  /** Watches every rule's build output, syncing on each settled change. */
  async watch(): Promise<void> {
    const ignored = new FunctionPackage(this.target.rules, this.artifactsDir);
    for (const rule of this.target.rules) {
      const source = join(this.artifactsDir, rule.app);
      await ensureDir(source);
      this.listen(source, (file) => ignored.ignores(rule, file));
    }
  }

  async sync(): Promise<void> {
    if (this.updating) {
      this.outdated = true;
      return;
    }
    this.updating = this.update().catch((error) => {
      console.error(
        `${this.target.logicalId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    });
    await this.updating;
    this.updating = undefined;
    if (!this.outdated) return;
    this.outdated = false;
    await this.sync();
  }

  /** Schedules a sync for every change under `source` that `ignores` doesn't leave out, for as long as the session lasts. */
  private async listen(
    source: string,
    ignores: (file: string) => boolean,
  ): Promise<void> {
    for await (const event of Deno.watchFs(source, { recursive: true })) {
      const files = event.paths.map((path) =>
        relative(source, path).split(SEPARATOR).join("/")
      );
      if (files.length > 0 && files.every(ignores)) continue;
      clearTimeout(this.settling);
      this.settling = setTimeout(() => this.sync(), SETTLE_MS);
    }
  }

  private async update(): Promise<void> {
    await this.target.update();
    const apps = this.target.rules.map((rule) => rule.app).join(", ");
    console.error(
      `${
        new Date().toLocaleTimeString()
      } ${this.target.logicalId}: synced from ${apps}`,
    );
  }
}

/** A deployed function, whose code is replaced by a fresh package of its rules' build output. */
class FunctionTarget implements Target {
  constructor(
    readonly logicalId: string,
    readonly rules: readonly SyncRule[],
    private readonly functionName: string,
    private readonly artifactsDir: string,
    private readonly zipPath: string,
  ) {}

  async update(): Promise<void> {
    const bundle = new FunctionPackage(this.rules, this.artifactsDir);
    await Deno.writeFile(
      this.zipPath,
      new FunctionAdapter().adapt(await bundle.zip()),
    );
    await $`aws lambda update-function-code --function-name ${this.functionName} --zip-file ${`fileb://${this.zipPath}`}`
      .quiet();
    await this.settled();
  }

  /**
   * Waits for the code update to finish — polled more often than `aws lambda
   * wait function-updated`'s fixed 5 s, which would dominate every sync.
   */
  private async settled(): Promise<void> {
    for (let attempt = 0; attempt < UPDATE_POLLS; attempt++) {
      const status =
        await $`aws lambda get-function-configuration --function-name ${this.functionName} --query LastUpdateStatus --output text`
          .text();
      if (status === "Successful") return;
      if (status === "Failed") throw new Error("the code update failed.");
      await new Promise((resolve) => setTimeout(resolve, UPDATE_POLL_MS));
    }
    throw new Error("the code update didn't finish in time.");
  }
}

/**
 * A deployed bucket, each rule's build output mirrored under its `path` key
 * prefix (objects the output no longer has are removed — so rules shouldn't
 * nest one prefix inside another), then invalidated in every distribution
 * routing to it so they don't keep serving what they cached.
 */
class BucketTarget implements Target {
  constructor(
    readonly logicalId: string,
    readonly rules: readonly SyncRule[],
    private readonly bucket: string,
    private readonly distributionIds: readonly string[],
    private readonly artifactsDir: string,
  ) {}

  async update(): Promise<void> {
    for (const rule of this.rules) {
      const excludes = (rule.ignore ?? []).flatMap((
        pattern,
      ) => ["--exclude", pattern]);
      await $`aws s3 sync ${
        join(this.artifactsDir, rule.app)
      } ${`s3://${this.bucket}/${
        prefixOf(rule)
      }`} --delete --only-show-errors ${excludes}`
        .quiet();
    }
    const paths = this.rules.map((rule) => `/${prefixOf(rule)}*`);
    for (const distributionId of this.distributionIds) {
      await $`aws cloudfront create-invalidation --distribution-id ${distributionId} --paths ${paths}`
        .quiet();
    }
  }
}

/** A rule's `path` as an S3 key prefix: `/` is the bucket's root, `assets` is `assets/`. */
function prefixOf(rule: SyncRule): string {
  const trimmed = rule.path.replace(/^\/+|\/+$/g, "");
  return trimmed === "" ? "" : `${trimmed}/`;
}

const [templatePath, stackName] = Deno.args;
if (!templatePath || !stackName) {
  throw new Error("usage: watch.ts <template path> <stack name>");
}

const stack = new Stack(stackName);
const deployed = await stack.deploy(templatePath);
if (deployed !== 0) Deno.exit(deployed);

const template = await readTemplate(templatePath);
const resources = Object.entries(template.Resources ?? {});

const distributions = resources.flatMap(([logicalId, resource]) => {
  const targets = resource.Metadata?.[ROUTES_METADATA] as
    | readonly RoutedTarget[]
    | undefined;
  return resource.Type === "AWS::CloudFront::Distribution" && targets
    ? [{ logicalId, targets }]
    : [];
});
const gateways = await Promise.all(
  distributions.map(({ logicalId, targets }) =>
    stack.outputOf(`${logicalId}Url`).then((url) => ({ url, targets }))
  ),
);
for (
  const line of new RouteListing(Deno.env.get(CLOUDFRONT_URL)).lines(gateways)
) {
  console.error(line);
}

const declared = resources.flatMap(([logicalId, resource]) => {
  const development = resource.Metadata?.[DEVELOPMENT_METADATA] as
    | DevelopmentSync
    | undefined;
  return development
    ? [{ logicalId, type: resource.Type, rules: development.sync }]
    : [];
});
if (declared.length === 0) {
  console.error(
    "Nothing to watch: no function or bucket declares development.sync. The stack is deployed; add a sync rule to one to have it kept current.",
  );
  Deno.exit(1);
}

const scratch = await Deno.makeTempDir({ prefix: "ens-aws-watch-" });
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  Deno.addSignalListener(signal, () => {
    Deno.removeSync(scratch, { recursive: true });
    Deno.exit(0);
  });
}

/** The distributions routing to the bucket `logicalId` — route metadata names targets by resource name. */
async function distributionIdsFor(logicalId: string): Promise<string[]> {
  const routing = distributions.filter(({ targets }) =>
    targets.some((target) => pascalCase(target.service) === logicalId)
  );
  return await Promise.all(
    routing.map((distribution) => stack.physicalIdOf(distribution.logicalId)),
  );
}

const artifactsDir = artifactsDirFor(templatePath);
const repoRoot = dirname(dirname(artifactsDir));
/** A rule names an app; what runs on aws is that app's aws integration when it has one (what `ens develop` keeps built for it). */
async function integrated(rules: readonly SyncRule[]): Promise<SyncRule[]> {
  return await Promise.all(
    rules.map(async (rule) => ({
      ...rule,
      app: await KitSdk.Deploy.buildUnitFor(repoRoot, rule.app, "aws"),
    })),
  );
}
const targets: Target[] = await Promise.all(
  declared.map(async ({ logicalId, type, rules: declaredRules }) => {
    const rules = await integrated(declaredRules);
    const physicalId = await stack.physicalIdOf(logicalId);
    if (type === "AWS::S3::Bucket") {
      return new BucketTarget(
        logicalId,
        rules,
        physicalId,
        await distributionIdsFor(logicalId),
        artifactsDir,
      );
    }
    return new FunctionTarget(
      logicalId,
      rules,
      physicalId,
      artifactsDir,
      join(scratch, `${logicalId}.zip`),
    );
  }),
);

// A first sync before watching, as compose's `initial_sync`: what was deployed
// was packed while the companion build may still have been writing, and an
// unchanged template leaves an earlier session's code in place.
for (const target of targets) {
  const syncer = new Syncer(target, artifactsDir);
  await syncer.sync();
  await syncer.watch();
}
console.error("Watching for changes. Press Ctrl+C to stop.");
