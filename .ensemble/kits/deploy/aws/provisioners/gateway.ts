import * as KitSdk from "@ensemble/kit-sdk";
import { pascalCase } from "../pascal-case.ts";
import { getAtt, join, ref, select, split, sub } from "../cfn.ts";
import { type RoutedTarget, ROUTES_METADATA } from "../routes-metadata.ts";

/** One `routes` entry as this kit reads it: a path pattern and either a function (`service`) or a bucket (`storage`) behind it. */
interface Route {
  readonly path: string;
  readonly target: { readonly service?: string; readonly storage?: string };
}

/** A route target, as the CloudFront origin it becomes. */
interface Origin {
  readonly id: string;
  readonly kind: "function" | "storage";
  readonly name: string;
}

const CATCH_ALL = new Set(["/*", "/"]);
const ALL_METHODS = [
  "GET",
  "HEAD",
  "OPTIONS",
  "PUT",
  "PATCH",
  "POST",
  "DELETE",
];
/** What reaches a function: everything a request carries except `Host` (CloudFront must address the API by its own name). */
const FUNCTION_HEADERS = [
  "Authorization",
  "Content-Type",
  "Accept",
  "Origin",
  "Referer",
];

/**
 * Client-side routes (`/experiences/42`) have no file behind them; only paths
 * naming a file (with an extension) are fetched as-is, everything else gets
 * the app shell. Done on the request, so it never rewrites a real error from
 * another origin the way a distribution-wide error page would.
 */
const SPA_FALLBACK_FUNCTION = `function handler(event) {
  var request = event.request;
  if (!/\\.[^/]+$/.test(request.uri)) request.uri = "/index.html";
  return request;
}`;

function parseRoutes(raw: unknown, gateway: string): Route[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`gateway ${gateway}: "routes" must be a non-empty list.`);
  }
  return raw.map((entry, index) => {
    const route = entry as Partial<Route> & { host?: unknown };
    if (route.host !== undefined) {
      throw new Error(
        `gateway ${gateway}: routes[${index}].host — custom domains aren't supported by the aws kit yet; route by path only.`,
      );
    }
    const target = route.target ?? {};
    if (
      typeof route.path !== "string" || (!target.service === !target.storage)
    ) {
      throw new Error(
        `gateway ${gateway}: routes[${index}] needs a "path" and a target naming exactly one of "service" (a function) or "storage" (a bucket).`,
      );
    }
    return { path: route.path, target };
  });
}

function originOf(route: Route): Origin {
  const name = (route.target.service ?? route.target.storage)!;
  const kind = route.target.service ? "function" : "storage";
  return { id: `${kind}-${name}`, kind, name };
}

/**
 * Fulfills `gateway` on aws as a CloudFront distribution — the single HTTPS
 * entry point routing by path:
 *
 * - a `service` target is a `function`, fronted by its own API Gateway HTTP
 *   API (Lambda proxy, `$default` route and stage); CloudFront reaches it
 *   over HTTPS at the API's own endpoint (`ApiEndpoint`, so it's whatever the
 *   environment's API Gateway calls itself).
 * - a `storage` target is an `object-storage` bucket, read through Origin
 *   Access Control: the bucket stays private, and its policy lets only this
 *   distribution read it. Its route falls back to `/index.html` for paths
 *   that aren't files, so a single-page app's routes load.
 *
 * The catch-all route (`/*`) is the distribution's default behavior; every
 * other path pattern is matched first. Viewers on plain HTTP are redirected
 * to HTTPS. Nothing is cached for a function; a bucket's files are.
 */
export function gatewayProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    // deno-lint-ignore require-await
    matches: async (resource) =>
      resource.category === "networking" &&
      resource.declaration.type === "gateway",
    // deno-lint-ignore require-await
    describe: async () => "gateway (AWS::CloudFront::Distribution)",
    // deno-lint-ignore require-await
    provision: async (request) => {
      const logicalId = pascalCase(request.name);
      const routes = parseRoutes(request.params.routes, request.name);
      const catchAll = routes.find((route) => CATCH_ALL.has(route.path));
      if (!catchAll) {
        throw new Error(
          `gateway ${request.name}: the aws kit needs a catch-all route ("/*") for CloudFront's default behavior.`,
        );
      }

      const origins = [...new Map(routes.map((route) => {
        const origin = originOf(route);
        return [origin.id, origin] as const;
      })).values()];
      const hasStorage = origins.some((origin) => origin.kind === "storage");
      const oacId = `${logicalId}OriginAccess`;
      const spaFunctionId = `${logicalId}SpaFallback`;

      const resources: Record<string, unknown> = {};
      for (const origin of origins) {
        Object.assign(
          resources,
          origin.kind === "function"
            ? functionApiResources(origin.name)
            : bucketReadResources(origin.name, logicalId),
        );
      }
      if (hasStorage) {
        resources[oacId] = {
          Type: "AWS::CloudFront::OriginAccessControl",
          Properties: {
            OriginAccessControlConfig: {
              Name: sub(`\${AWS::StackName}-${request.name}`, {}),
              OriginAccessControlOriginType: "s3",
              SigningBehavior: "always",
              SigningProtocol: "sigv4",
            },
          },
        };
        resources[spaFunctionId] = {
          Type: "AWS::CloudFront::Function",
          Properties: {
            Name: sub(`\${AWS::StackName}-${request.name}-spa`, {}),
            AutoPublish: true,
            FunctionCode: SPA_FALLBACK_FUNCTION,
            FunctionConfig: {
              Comment: "Single-page app fallback",
              Runtime: "cloudfront-js-2.0",
            },
          },
        };
      }

      const behavior = (route: Route) =>
        behaviorFor(originOf(route), spaFunctionId);
      resources[logicalId] = {
        Type: "AWS::CloudFront::Distribution",
        Metadata: { [ROUTES_METADATA]: routedTargets(routes) },
        Properties: {
          DistributionConfig: {
            Enabled: true,
            ...(originOf(catchAll).kind === "storage"
              ? { DefaultRootObject: "index.html" }
              : {}),
            Origins: origins.map((origin) => originConfig(origin, oacId)),
            DefaultCacheBehavior: behavior(catchAll),
            CacheBehaviors: routes
              .filter((route) => route !== catchAll)
              .map((route) => ({
                PathPattern: route.path,
                ...behavior(route),
              })),
          },
        },
      };

      return {
        fragment: {
          category: request.category,
          name: request.name,
          content: {
            resources,
            outputs: {
              [`${logicalId}Url`]: {
                Description: `The ${request.name} gateway's address.`,
                Value: join(["https://", getAtt(logicalId, "DomainName")]),
              },
            },
          },
        },
        outputs: {},
      };
    },
  };
}

/** Every route target in declaration order, with each path routed to it — the gateway's `ROUTES_METADATA`. */
function routedTargets(routes: readonly Route[]): RoutedTarget[] {
  const targets = new Map<string, string[]>();
  for (const route of routes) {
    const service = (route.target.service ?? route.target.storage)!;
    targets.set(service, [...targets.get(service) ?? [], route.path]);
  }
  return [...targets].map(([service, paths]) => ({ service, paths }));
}

/** A function's HTTP front: an HTTP API whose `$default` route proxies every request to it, and the permission letting that API invoke it. */
function functionApiResources(service: string): Record<string, unknown> {
  const fn = pascalCase(service);
  const api = `${fn}HttpApi`;
  return {
    [api]: {
      Type: "AWS::ApiGatewayV2::Api",
      Properties: {
        Name: sub(`\${AWS::StackName}-${service}`, {}),
        ProtocolType: "HTTP",
      },
    },
    [`${api}Integration`]: {
      Type: "AWS::ApiGatewayV2::Integration",
      Properties: {
        ApiId: ref(api),
        IntegrationType: "AWS_PROXY",
        IntegrationUri: getAtt(fn, "Arn"),
        PayloadFormatVersion: "2.0",
      },
    },
    [`${api}Route`]: {
      Type: "AWS::ApiGatewayV2::Route",
      Properties: {
        ApiId: ref(api),
        RouteKey: "$default",
        Target: sub(`integrations/\${Integration}`, {
          Integration: ref(`${api}Integration`),
        }),
      },
    },
    [`${api}Stage`]: {
      Type: "AWS::ApiGatewayV2::Stage",
      Properties: { ApiId: ref(api), StageName: "$default", AutoDeploy: true },
    },
    [`${api}Permission`]: {
      Type: "AWS::Lambda::Permission",
      Properties: {
        FunctionName: ref(fn),
        Action: "lambda:InvokeFunction",
        Principal: "apigateway.amazonaws.com",
        SourceArn: sub(
          `arn:\${AWS::Partition}:execute-api:\${AWS::Region}:\${AWS::AccountId}:\${Api}/*`,
          {
            Api: ref(api),
          },
        ),
      },
    },
  };
}

/** The bucket policy letting only this distribution (through its Origin Access Control) read the bucket's objects. */
function bucketReadResources(
  storage: string,
  distribution: string,
): Record<string, unknown> {
  const bucket = pascalCase(storage);
  return {
    [`${bucket}GatewayRead`]: {
      Type: "AWS::S3::BucketPolicy",
      Properties: {
        Bucket: ref(bucket),
        PolicyDocument: {
          Version: "2012-10-17",
          Statement: [{
            Effect: "Allow",
            Principal: { Service: "cloudfront.amazonaws.com" },
            Action: "s3:GetObject",
            Resource: join([getAtt(bucket, "Arn"), "/*"]),
            Condition: {
              StringEquals: {
                "AWS:SourceArn": sub(
                  `arn:\${AWS::Partition}:cloudfront::\${AWS::AccountId}:distribution/\${Distribution}`,
                  { Distribution: ref(distribution) },
                ),
              },
            },
          }],
        },
      },
    },
  };
}

function originConfig(origin: Origin, oacId: string): Record<string, unknown> {
  if (origin.kind === "storage") {
    return {
      Id: origin.id,
      DomainName: getAtt(pascalCase(origin.name), "RegionalDomainName"),
      S3OriginConfig: { OriginAccessIdentity: "" },
      OriginAccessControlId: getAtt(oacId, "Id"),
    };
  }
  // `ApiEndpoint` is "https://<host>[:port]"; an origin wants the bare host.
  const endpoint = getAtt(`${pascalCase(origin.name)}HttpApi`, "ApiEndpoint");
  return {
    Id: origin.id,
    DomainName: select(0, split(":", select(1, split("://", endpoint)))),
    CustomOriginConfig: {
      OriginProtocolPolicy: "https-only",
      OriginSSLProtocols: ["TLSv1.2"],
    },
  };
}

function behaviorFor(
  origin: Origin,
  spaFunctionId: string,
): Record<string, unknown> {
  if (origin.kind === "function") {
    return {
      TargetOriginId: origin.id,
      ViewerProtocolPolicy: "redirect-to-https",
      AllowedMethods: ALL_METHODS,
      CachedMethods: ["GET", "HEAD"],
      ForwardedValues: {
        QueryString: true,
        Headers: FUNCTION_HEADERS,
        Cookies: { Forward: "all" },
      },
      MinTTL: 0,
      DefaultTTL: 0,
      MaxTTL: 0,
    };
  }
  return {
    TargetOriginId: origin.id,
    ViewerProtocolPolicy: "redirect-to-https",
    AllowedMethods: ["GET", "HEAD"],
    ForwardedValues: { QueryString: false },
    FunctionAssociations: [{
      EventType: "viewer-request",
      FunctionARN: getAtt(spaFunctionId, "FunctionARN"),
    }],
  };
}
