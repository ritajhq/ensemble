import { join } from "@std/path";
import { parse as parseYaml, stringify as stringifyYaml } from "@std/yaml";
import { $ } from "@david/dax";
import { FunctionAdapter } from "./function-adapter.ts";

const ARTIFACTS_BUCKET = "ENS_AWS_ARTIFACTS_BUCKET";

/** The rendered template, as far as this kit reads it back. */
export interface Template {
  readonly Resources?: Readonly<
    Record<
      string,
      {
        Type?: string;
        Metadata?: Record<string, unknown>;
        Properties?: { Code?: unknown };
      }
    >
  >;
}

export async function readTemplate(path: string): Promise<Template> {
  return parseYaml(await Deno.readTextFile(path)) as Template;
}

/**
 * The deployment's CloudFormation stack, in whichever AWS the environment
 * points the `aws` CLI at (`AWS_ENDPOINT_URL`, credentials, region) — never
 * this kit's choice.
 */
export class Stack {
  constructor(private readonly name: string) {}

  /**
   * Deploys `templatePath`, every function's bundle first adapted to Lambda
   * (`FunctionAdapter`) — a packed local file or a published one alike — and
   * uploaded (`aws cloudformation package`) to the environment's artifacts
   * bucket, `ENS_AWS_ARTIFACTS_BUCKET`. Resolves to the deploy's exit code; a
   * failed upload resolves to 1, the `aws` CLI's own error already on stderr.
   */
  async deploy(templatePath: string): Promise<number> {
    const template = await readTemplate(templatePath);
    const deployable = needsPackaging(template)
      ? await this.packaged(await this.adapted(template))
      : templatePath;
    if (deployable === undefined) return 1;
    const result =
      await $`aws cloudformation deploy --template-file ${deployable} --stack-name ${this.name} --capabilities CAPABILITY_NAMED_IAM --no-fail-on-empty-changeset`
        .noThrow();
    return result.code;
  }

  /** The physical id (a function's name, a bucket's name…) CloudFormation gave the resource `logicalId`. */
  async physicalIdOf(logicalId: string): Promise<string> {
    return await $`aws cloudformation describe-stack-resource --stack-name ${this.name} --logical-resource-id ${logicalId} --query StackResourceDetail.PhysicalResourceId --output text`
      .text();
  }

  /** The value of the stack's output `key`. */
  async outputOf(key: string): Promise<string> {
    return await $`aws cloudformation describe-stacks --stack-name ${this.name} --query ${`Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue | [0]`} --output text`
      .text();
  }

  /** A copy of `template` whose every function's code is its bundle adapted to Lambda, as a local file. */
  private async adapted(template: Template): Promise<string> {
    const dir = await Deno.makeTempDir({ prefix: "ens-aws-adapt-" });
    const adapter = new FunctionAdapter();
    const resources: Record<string, unknown> = { ...template.Resources };
    for (
      const [logicalId, resource] of Object.entries(template.Resources ?? {})
    ) {
      if (resource.Type !== "AWS::Lambda::Function") continue;
      const zip = join(dir, `${logicalId}.zip`);
      await Deno.writeFile(
        zip,
        adapter.adapt(await this.bundleAt(resource.Properties?.Code, dir)),
      );
      resources[logicalId] = {
        ...resource,
        Properties: { ...resource.Properties, Code: zip },
      };
    }
    const path = join(dir, "template.yaml");
    await Deno.writeTextFile(
      path,
      stringifyYaml({ ...template, Resources: resources }),
    );
    return path;
  }

  /** A function's bundle: its local file, or its published S3 object downloaded into `dir`. */
  private async bundleAt(code: unknown, dir: string): Promise<Uint8Array> {
    if (typeof code === "string") return await Deno.readFile(code);
    const { S3Bucket, S3Key } = code as { S3Bucket: string; S3Key: string };
    const local = join(dir, "published.zip");
    await $`aws s3 cp ${`s3://${S3Bucket}/${S3Key}`} ${local} --only-show-errors`;
    return await Deno.readFile(local);
  }

  /** The template with every (adapted) local bundle uploaded and replaced by its S3 location — or, having said why on stderr, `undefined` when that can't be done. */
  private async packaged(path: string): Promise<string | undefined> {
    const bucket = Deno.env.get(ARTIFACTS_BUCKET);
    if (!bucket) {
      console.error(
        `A function's bundle, adapted to Lambda, needs uploading before the deploy: set ${ARTIFACTS_BUCKET} to the environment's artifacts bucket.`,
      );
      return undefined;
    }
    const dir = await Deno.makeTempDir({ prefix: "ens-aws-package-" });
    const output = join(dir, "template.yaml");
    // Its upload progress goes to stderr, where only failures belong.
    const result =
      await $`aws cloudformation package --template-file ${path} --s3-bucket ${bucket} --s3-prefix ${this.name} --output-template-file ${output}`
        .stdout("null")
        .stderr("piped")
        .noThrow();
    if (result.code === 0) return output;
    await Deno.remove(dir, { recursive: true });
    console.error(result.stderr.trimEnd());
    return undefined;
  }
}

/** Whether the template has a function, whose bundle needs adapting and uploading before the deploy. */
function needsPackaging(template: Template): boolean {
  return Object.values(template.Resources ?? {}).some((resource) =>
    resource.Type === "AWS::Lambda::Function"
  );
}
