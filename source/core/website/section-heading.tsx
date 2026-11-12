type Align = "center" | "start";

const ALIGN: Record<Align, string> = {
  center: "mx-auto text-center",
  start: "text-left",
};

/** Which ground the heading sits on. */
type Tone = "light" | "dark";

const TONE: Record<Tone, { title: string; lede: string }> = {
  light: { title: "text-ink", lede: "text-stone" },
  dark: { title: "text-parchment", lede: "text-parchment/70" },
};

interface SectionHeadingProps {
  kicker: string;
  title: string;
  lede?: string;
  align?: Align;
  tone?: Tone;
}

/** The kicker, title and lede every landing section opens with. */
export function SectionHeading(
  { kicker, title, lede, align = "center", tone = "light" }:
    SectionHeadingProps,
) {
  return (
    <div className={`max-w-2xl ${ALIGN[align]}`}>
      <p className="text-xs font-semibold tracking-[0.25em] text-ochre uppercase">
        {kicker}
      </p>
      <h2
        className={`mt-3 font-serif text-3xl leading-tight sm:text-4xl ${
          TONE[tone].title
        }`}
      >
        {title}
      </h2>
      {lede && (
        <p
          className={`mt-4 text-base leading-relaxed sm:text-lg ${
            TONE[tone].lede
          }`}
        >
          {lede}
        </p>
      )}
    </div>
  );
}
