import * as KitSdk from "@ensemble/kit-sdk";

/** One sync rule: `app`'s build output (`source/artifacts/<app>`) lands at `path` inside a Worker's bundle, or under that prefix of a bucket's contents, leaving out what `ignore` matches. */
export interface SyncRule {
  readonly app: string;
  readonly path: string;
  readonly ignore?: readonly string[];
}

/**
 * A resource's `development.sync` rules — both groups alike, since every
 * update of a Worker starts it afresh — or `undefined` when there are none.
 * `refuse` names what this resource can't take (a bucket has no process to
 * restart, nor an environment to add to).
 */
export function syncRules(
  development: unknown,
  where: string,
  refuse: { restart?: boolean; env?: boolean } = {},
): readonly SyncRule[] | undefined {
  if (development === undefined) return undefined;
  const block = KitSdk.Deploy.parseDevelopmentBlock(development);
  if (refuse.restart && block["sync+restart"].length > 0) {
    throw new Error(
      `${where}: there's nothing to restart — use development.sync.`,
    );
  }
  if (refuse.env && Object.keys(block.env).length > 0) {
    throw new Error(
      `${where}: there's no environment for development.env to add to.`,
    );
  }
  const rules = [...block.sync, ...block["sync+restart"]];
  if (rules.length === 0) return undefined;
  return rules.map((rule) => ({
    app: rule.app,
    path: rule.path,
    ...(rule.ignore.length > 0 ? { ignore: [...rule.ignore] } : {}),
  }));
}
