import { WatchSession } from "./watch-session.ts";

/** Every watch session spawned by this `ens mcp` server, keyed by id — one process-wide registry so `ensemble_watch_logs`/`ensemble_watch_stop` can reach a session regardless of which tool started it. */
export class WatchSessionRegistry {
  private static readonly instance = new WatchSessionRegistry();
  static get Instance(): WatchSessionRegistry {
    return WatchSessionRegistry.instance;
  }

  private readonly sessions = new Map<string, WatchSession>();
  private nextId = 1;

  private constructor() {}

  Start(label: string, command: readonly string[]): WatchSession {
    const id = `${label.replace(/[^a-zA-Z0-9_-]+/g, "-")}-${this.nextId++}`;
    const session = new WatchSession(id, label, command);
    this.sessions.set(id, session);
    return session;
  }

  Get(id: string): WatchSession {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`No watch session "${id}". Use ensemble_watch_list to see active ones.`);
    }
    return session;
  }

  List(): WatchSession[] {
    return [...this.sessions.values()];
  }
}
