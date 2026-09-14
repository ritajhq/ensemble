import { ResourceContract } from "../contract.ts";

/**
 * `relational.v1` — a relational database. Params mirror Appendix A's worked
 * example (`engine`, `version`, `user`, `database`, `passwordSecret`); the
 * `read-replicas` capability is the plan's own running example of a
 * quantified capability (Section 7). Outputs are the portability contract
 * every kit realizing this Type must produce exactly: `url` is what Appendix
 * A's compute entry actually references (`${databases.primary.url}`); `host`,
 * `port`, `user`, `database` are exposed individually so a future reference
 * can address any one of them without a contract change.
 *
 * `deletionProtection` was added once Appendix A's own aws golden (Phase 7)
 * showed `class: critical` materializing it as a real RDS property alongside
 * `backupRetention`/`multiAz` — evidence compose's golden (Phase 5) never
 * surfaced, since compose has no equivalent to render it into.
 */
export const relationalV1 = new ResourceContract(
  "databases",
  "relational",
  "v1",
  [
    { name: "engine", required: true, type: "string" },
    { name: "version", required: true, type: "string" },
    { name: "user", required: true, type: "string" },
    { name: "database", required: true, type: "string" },
    { name: "passwordSecret", required: true, type: "string" },
  ],
  ["storageSize", "backupRetention", "multiAz", "deletionProtection"],
  [{ name: "read-replicas", quantified: true }],
  ["host", "port", "user", "database", "url"],
);
