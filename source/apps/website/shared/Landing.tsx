import { Hero } from "./sections/Hero.tsx";
import { Problem } from "./sections/Problem.tsx";
import { HowItWorks } from "./sections/HowItWorks.tsx";
import { Features } from "./sections/Features.tsx";
import { Principles } from "./sections/Principles.tsx";
import { InstallCta } from "./sections/InstallCta.tsx";
import { Footer } from "./sections/Footer.tsx";

export function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <Hero />
      <Problem />
      <HowItWorks />
      <Features />
      <Principles />
      <InstallCta />
      <Footer />
    </div>
  );
}
