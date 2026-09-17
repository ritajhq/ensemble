/**
 * A minimal, fully self-contained fixture deploy kit for
 * `subprocess-kit-loader.test.ts` — no external dependencies at all, so the
 * test never touches the network. It declares every optional `Kit`
 * capability except `emulateExternals`, so the test can assert
 * `SubprocessKitLoader`'s `$describe` capability handshake correctly reports
 * `watchCommand: true, emulateExternals: false` — the same class of bug
 * `loader.test.ts`'s in-process fixture guards against for the old loader.
 */
const kit = {
  provisioners: () => [
    {
      matches: (resource: { declaration: { type: string } }) =>
        resource.declaration.type === "widget",
      describe: () => "widget-provisioner",
      provision: (request: { category: string; name: string }) => ({
        fragment: {
          category: request.category,
          name: request.name,
          content: {},
        },
        outputs: {},
      }),
    },
    {
      // Deliberately no describe()/provision() — mirrors a project-declared
      // provisioner that hasn't implemented provisioning yet (Section 10's
      // extension ladder): both are legitimately absent, not a bug.
      matches: () => false,
    },
  ],
  realization: () => ({
    classPreset: (category: string, type: string, className: string) =>
      category === "databases" && type === "relational" &&
        className === "critical"
        ? { concernValues: { backupRetention: 35 } }
        : undefined,
    defaultFor: () => undefined,
    boundFor: () => undefined,
    supportsCapability: () => false,
    knowabilityOf: () => "static",
  }),
  // Calls graph.dependenciesOf() — a real method on the DependencyGraph
  // class, which JSON can't carry across the subprocess boundary on its own
  // (regression for exactly that: SubprocessKitLoader must snapshot it into
  // plain data and reconstruct an equivalent object on the other side, the
  // same way compose's own real present() calls dependenciesOf()).
  present: (
    artifacts: unknown,
    graph: {
      batches(): unknown[];
      dependenciesOf(id: { category: string; name: string }): unknown[];
    },
  ) => ({
    filename: "fixture.yaml",
    content: JSON.stringify({
      artifacts,
      apiDependencies: graph.dependenciesOf({ category: "compute", name: "api" }),
    }),
  }),
  applyCommand: (path: string, name: string) => ["fixture-apply", path, name],
  watchCommand: (path: string, name: string) => ["fixture-watch", path, name],
};

export default kit;
