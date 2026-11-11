import type { LaunchEntry } from "../deploy/launch.ts";

/** Port numbers for every launch entry's named ports, keyed `<entry>.<port>`. */
export type AssignedPorts = ReadonlyMap<string, number>;

/**
 * Gives each launch entry's ports their numbers: a fixed port is taken as written, `auto` is a free port found now. The
 * result is made once per session, so restarting an entry keeps the address the others were told.
 */
export class PortAllocator {
  assign(entries: Readonly<Record<string, LaunchEntry>>): AssignedPorts {
    const assigned = new Map<string, number>();
    for (const [name, entry] of Object.entries(entries)) {
      for (const [port, wanted] of Object.entries(entry.ports)) {
        assigned.set(
          `${name}.${port}`,
          wanted === "auto" ? this.free() : wanted,
        );
      }
    }
    return assigned;
  }

  /** A port nothing listens on at the moment: the system's choice, released straight away. */
  private free(): number {
    const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
    const { port } = listener.addr as Deno.NetAddr;
    listener.close();
    return port;
  }
}
