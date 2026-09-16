/**
 * Re-invokes `ens` the same way this process itself was started — via
 * `deno run -A <main.ts>` in development, or directly when compiled to a
 * single binary (`deno compile`). A watch session needs its own OS process
 * (see `WatchSession`), and that process must be the same CLI build the
 * `ens mcp` server is running from.
 */
export class SelfInvocation {
  static Command(args: string[]): string[] {
    const mainModule = new URL(Deno.mainModule);
    if (mainModule.protocol === "file:" && mainModule.pathname.endsWith(".ts")) {
      return [Deno.execPath(), "run", "-A", mainModule.pathname, ...args];
    }
    return [Deno.execPath(), ...args];
  }
}
