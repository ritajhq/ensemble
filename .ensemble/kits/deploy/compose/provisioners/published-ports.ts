/**
 * A compute's `publish` param (port name → host port) as compose `ports:`
 * entries (`"443:443"`): the one way a compute is reachable at the host's own
 * address under `ens deploy`, where nothing is published by default. Each name
 * must be one of the compute's declared `ports` — the container side comes
 * from there, so a manifest never states a container port twice. A host port
 * may arrive as a string (a `${variables.*}` reference resolves to one).
 */
export function publishedPorts(
  publish: unknown,
  ports: unknown,
): { entries: string[]; containerPorts: number[] } {
  const entries: string[] = [];
  const containerPorts: number[] = [];
  if (typeof publish !== "object" || publish === null) {
    return { entries, containerPorts };
  }
  const declared = (ports ?? {}) as Record<string, unknown>;

  for (const [name, host] of Object.entries(publish)) {
    const container = declared[name];
    if (typeof container !== "number") {
      throw new Error(
        `publish names port "${name}", which the compute doesn't declare under \`ports\` (declared: ${
          Object.keys(declared).join(", ") || "none"
        }).`,
      );
    }
    const hostPort = Number(host);
    if (!Number.isInteger(hostPort) || hostPort < 1 || hostPort > 65535) {
      throw new Error(
        `publish.${name} must be a host port between 1 and 65535 (got ${
          JSON.stringify(host)
        }).`,
      );
    }
    entries.push(`${hostPort}:${container}`);
    containerPorts.push(container);
  }
  return { entries, containerPorts };
}
