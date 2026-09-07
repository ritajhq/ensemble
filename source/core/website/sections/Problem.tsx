import { Container } from "../Container.tsx";

export function Problem() {
  return (
    <section className="py-20">
      <Container>
        <h2 className="max-w-3xl text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Most projects trade tidiness for speed — and the trade gets worse as they grow.
        </h2>
        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-600">
          The longer a TypeScript project survives, the more its structure crystallizes
          and the slower it gets to change. New app types mean new one-off build
          scripts. New environments mean forked code paths. Releases mean eyeballing
          git history before tagging.
        </p>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-600">
          Ensemble is a bet that this is a tooling failure, not a law of nature — that
          the right workspace layout and a single coherent CLI can give you tidiness
          and speed at once, indefinitely, instead of forcing that trade as the
          project grows.
        </p>
      </Container>
    </section>
  );
}
