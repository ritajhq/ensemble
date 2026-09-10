import { Hero } from "./sections/Hero.tsx";
import { Problem } from "./sections/Problem.tsx";
import { Workspace } from "./sections/Workspace.tsx";
import { CliTabs } from "./sections/CliTabs.tsx";
import { Delivery } from "./sections/Delivery.tsx";
import { Footer } from "./sections/Footer.tsx";

export function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <Hero />
      <Problem />
      <Workspace />
      <CliTabs />
      <Delivery />
      <Footer />
    </div>
  );
}
