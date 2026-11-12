import { Logo } from "./Logo.tsx";
import { RELEASES_URL } from "./constants.ts";
import { Garland } from "./botanicals.tsx";
import { InstallCommand } from "./install-command.tsx";
import { Meander } from "./meander.tsx";
import { SiteNav } from "./site-nav.tsx";

export function Hero() {
  return (
    <header className="relative overflow-hidden">
      <Meander className="text-ochre/35" />
      <SiteNav />

      <div className="relative overflow-x-clip">
        <div className="relative left-1/2 w-[max(100%,760px)] -translate-x-1/2">
          <Garland className="w-full" />
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
            <Logo className="rise h-[13vw] max-h-24 min-h-12 w-auto drop-shadow-sm" />
            <p
              style={{ animationDelay: "450ms" }}
              className="rise mt-2 font-serif text-[clamp(3rem,9vw,6.5rem)] leading-none tracking-tight text-ink"
            >
              Ensemble
            </p>
            <p
              style={{ animationDelay: "600ms" }}
              className="rise mt-4 max-w-md px-4 text-center text-sm leading-relaxed text-stone"
            >
              <strong className="font-semibold text-ink">Ensemble</strong>{" "}
              <span className="font-mono text-xs">[ɒnˈsɒm.bəl]</span>{" "}
              <span className="text-[10px] tracking-widest uppercase">
                noun
              </span>{" "}
              A group of players performing as one. Here: an open-source
              workspace where every app, kit and deployment plays in tune.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 pb-12 text-center sm:px-6">
        <h1
          style={{ animationDelay: "750ms" }}
          className="rise font-serif text-4xl leading-[1.12] tracking-tight text-ink sm:text-5xl lg:text-6xl"
        >
          A workspace orchestrator for{" "}
          <span className="text-aegean">building</span>,{" "}
          <span className="text-olive">packaging</span>, and{" "}
          <span className="text-terracotta">deploying</span> your apps.
        </h1>
        <p
          style={{ animationDelay: "900ms" }}
          className="rise mx-auto mt-6 max-w-xl text-lg leading-relaxed text-stone"
        >
          Ensemble sets your workspace and orchestrates pluggable kits to build,
          package, and deploy through a single CLI.
        </p>

        <div
          style={{ animationDelay: "1050ms" }}
          className="rise mx-auto mt-8 max-w-xl"
        >
          <InstallCommand />
        </div>
        <p
          style={{ animationDelay: "1150ms" }}
          className="rise mt-4 text-xs text-stone"
        >
          One native binary · Linux x64 · MIT licensed ·{" "}
          <a
            href={RELEASES_URL}
            className="underline decoration-ochre/50 underline-offset-2 hover:text-ink"
          >
            release notes
          </a>
        </p>
      </div>
    </header>
  );
}
