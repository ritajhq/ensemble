export * as Build from "@ensemble/core/build-context";
export * as Pack from "@ensemble/core/pack-context";
export * as Scaffold from "@ensemble/core/scaffold-context";
export * as Deploy from "@ensemble/core/deploy";
export * as Lib from "@ensemble/core/lib-context";

// Re-exported from @ensemble/host: safe to run standalone outside the
// monorepo (no dax-based adapters), for the few kits that need real
// machine-level plumbing a kit's own CLI contract doesn't cover.
export { findRepoRoot, resolveDenoExecutable, terminateChildrenOnSignal, type Spawned } from "@ensemble/host";
