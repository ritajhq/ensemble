import { Hero } from "./sections/Hero.tsx";
import { Problem } from "./sections/Problem.tsx";
import { CliTabs } from "./sections/CliTabs.tsx";
import { Footer } from "./sections/Footer.tsx";

export function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <Hero />
      <Problem />
      <CliTabs />
      <Footer />
    </div>
  );
}
