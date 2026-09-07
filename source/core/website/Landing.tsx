import { Hero } from "./sections/Hero.tsx";
import { Problem } from "./sections/Problem.tsx";
import { KeyBenefits } from "./sections/KeyBenefits.tsx";
import { CliTabs } from "./sections/CliTabs.tsx";
import { Principles } from "./sections/Principles.tsx";
import { Footer } from "./sections/Footer.tsx";

export function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <Hero />
      <Problem />
      <KeyBenefits />
      <CliTabs />
      <Principles />
      <Footer />
    </div>
  );
}
