// The Lambda handler the aws kit adds to every function's bundle: it adapts
// an API Gateway HTTP API (payload format 2.0) proxy event to the Fetch API
// the bundle's own `aws.js` entry answers — `Request` in, `Response` out,
// with the function's environment as `env` — and back. The bundle stays
// platform-neutral; this is the one piece that knows Lambda.
import { Buffer } from "node:buffer";
import process from "node:process";
import entry from "./aws.js";

/** Body types sent as text; everything else is base64-encoded, as API Gateway requires for binary. */
const TEXT_CONTENT =
  /^(text\/|application\/(json|javascript|xml)|[^;]*\+json|[^;]*\+xml)/;

export async function handler(event) {
  const response = await entry.fetch(toRequest(event), process.env);
  return await toResult(response);
}

function toRequest(event) {
  const host = event.requestContext.domainName ?? event.headers?.host ??
    "localhost";
  const query = event.rawQueryString ? `?${event.rawQueryString}` : "";
  const headers = new Headers(event.headers ?? {});
  if (event.cookies && event.cookies.length > 0) {
    headers.set("cookie", event.cookies.join("; "));
  }
  const method = event.requestContext.http.method;
  const hasBody = event.body !== undefined && method !== "GET" &&
    method !== "HEAD";
  return new Request(`https://${host}${event.rawPath}${query}`, {
    method,
    headers,
    body: hasBody
      ? (event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body)
      : undefined,
  });
}

async function toResult(response) {
  const headers = {};
  for (const [name, value] of response.headers) {
    if (name !== "set-cookie") headers[name] = value;
  }
  const cookies = response.headers.getSetCookie();
  const text = TEXT_CONTENT.test(
    response.headers.get("content-type") ?? "text/plain",
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    statusCode: response.status,
    headers,
    ...(cookies.length > 0 ? { cookies } : {}),
    body: text ? bytes.toString("utf8") : bytes.toString("base64"),
    isBase64Encoded: !text,
  };
}
