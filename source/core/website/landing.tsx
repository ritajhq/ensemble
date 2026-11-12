import { type Accent, Accented } from "./botanicals.tsx";
import { Hero } from "./hero.tsx";
import { Roles } from "./roles.tsx";
import { Workspace } from "./workspace.tsx";
import { Stages } from "./stages.tsx";
import { Agents } from "./agents.tsx";
import { Finale } from "./finale.tsx";

/** Plants growing in beside each section, alternating sides down the page. */
const ACCENTS: Record<"roles" | "workspace" | "stages" | "finale", Accent[]> = {
  roles: [
    { plant: "vinca", edge: "right", top: 30, width: 24, inset: 2, rotate: -8 },
  ],
  workspace: [
    { plant: "laurel", edge: "left", top: 55, width: 17, inset: 1, rotate: 50 },
  ],
  stages: [
    {
      plant: "jasmine",
      edge: "right",
      top: 40,
      width: 22,
      inset: 3,
      rotate: 8,
    },
    {
      plant: "myrtle-berries",
      edge: "left",
      top: 85,
      width: 12,
      inset: 1,
      rotate: 80,
    },
  ],
  finale: [
    {
      plant: "anemones",
      edge: "left",
      top: 45,
      width: 17,
      inset: 1,
      rotate: 55,
    },
    {
      plant: "olive-branch",
      edge: "right",
      top: 50,
      width: 22,
      inset: 2,
      rotate: -88,
    },
  ],
};

/** The Mediterranean take on the landing page: the lyre, a garland of botanical plates, and the ensemble metaphor played straight. */
export function Landing() {
  return (
    <div className="min-h-screen overflow-x-clip bg-parchment font-sans text-ink antialiased">
      <Hero />
      <Accented accents={ACCENTS.roles}>
        <Roles />
      </Accented>
      <Accented accents={ACCENTS.workspace} className="bg-marble/60">
        <Workspace />
      </Accented>
      <Accented accents={ACCENTS.stages}>
        <Stages />
      </Accented>
      <Agents />
      <Accented accents={ACCENTS.finale}>
        <Finale />
      </Accented>
    </div>
  );
}
