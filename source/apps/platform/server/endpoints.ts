export type Params = Readonly<Record<string, string | undefined>>;

/** How one endpoint answers a request, given what its path named. */
export type Answer = (request: Request, params: Params) => Promise<Response>;

interface Endpoint {
  readonly method: string;
  readonly pattern: URLPattern;
  readonly answer: Answer;
}

/**
 * The platform's HTTP endpoints, as each part of its API registers its own:
 * a method and a path pattern (`/api/projects/:id`) to an answer. A request
 * goes to the first endpoint that matches it.
 */
export class Endpoints {
  private readonly endpoints: Endpoint[] = [];

  add(method: string, pathname: string, answer: Answer): void {
    this.endpoints.push({
      method,
      pattern: new URLPattern({ pathname }),
      answer,
    });
  }

  async answer(request: Request): Promise<Response> {
    for (const endpoint of this.endpoints) {
      if (endpoint.method !== request.method) continue;
      const match = endpoint.pattern.exec(request.url);
      if (match) return await endpoint.answer(request, match.pathname.groups);
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}
