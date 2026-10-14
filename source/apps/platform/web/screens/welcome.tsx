import { Panel } from "../components/panel.tsx";

/** Shown before any project is picked. */
export function Welcome() {
  return (
    <Panel
      title="Release and deploy ensemble projects"
      description="Pick a project in the sidebar, or add one: a GitHub repository with delivery manifests under ci/."
    />
  );
}
