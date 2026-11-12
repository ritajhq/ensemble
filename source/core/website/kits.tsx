import type { KitListing, KitRole } from "./kit-types.ts";
import { type Accent, Accented } from "./botanicals.tsx";
import { Meander } from "./meander.tsx";
import { SectionHeading } from "./section-heading.tsx";
import { SiteFooter } from "./site-footer.tsx";
import { SiteNav } from "./site-nav.tsx";

export interface KitsProps {
  kits: KitListing[];
  /** The role the list is narrowed to (`/kits?role=deploy`); none lists every kit. */
  role?: KitRole;
}

/** The roles in the order `ens` runs them, each with what it means for a newcomer. */
const ROLES: { role: KitRole; label: string; blurb: string }[] = [
  { role: "build", label: "Build", blurb: "turn an app's source into output" },
  { role: "pack", label: "Pack", blurb: "turn output into something to ship" },
  { role: "deploy", label: "Deploy", blurb: "bring a workload up on a target" },
  {
    role: "ecosystem",
    label: "Ecosystem",
    blurb: "make a language a workspace member",
  },
  { role: "lib", label: "Library", blurb: "publish a library to a registry" },
];

const ROLE_LABEL = Object.fromEntries(
  ROLES.map(({ role, label }) => [role, label]),
) as Record<KitRole, string>;

/** Each stage's badge in the colour the hero gives it; the other roles keep ochre. */
const ROLE_TONE: Record<KitRole, string> = {
  build: "bg-aegean/10 text-aegean",
  pack: "bg-olive/10 text-olive",
  deploy: "bg-terracotta/10 text-terracotta",
  ecosystem: "bg-ochre/10 text-ochre",
  lib: "bg-ochre/10 text-ochre",
};

const HEADER_ACCENTS: Accent[] = [
  {
    plant: "olive-branch",
    edge: "left",
    top: 55,
    width: 22,
    inset: 2,
    rotate: 88,
  },
  { plant: "vinca", edge: "right", top: 50, width: 22, inset: 2, rotate: -8 },
];

function RoleFilter({ kits, role }: KitsProps) {
  const options = [
    {
      href: "/kits",
      label: "All",
      count: kits.length,
      active: role === undefined,
    },
    ...ROLES.map((entry) => ({
      href: `/kits?role=${entry.role}`,
      label: entry.label,
      count: kits.filter((kit) => kit.role === entry.role).length,
      active: role === entry.role,
    })),
  ].filter((option) => option.count > 0);
  return (
    <nav
      aria-label="Kit roles"
      className="mt-10 flex flex-wrap justify-center gap-2"
    >
      {options.map((option) => (
        <a
          key={option.href}
          href={option.href}
          aria-current={option.active ? "page" : undefined}
          className={`rounded-full px-4 py-1.5 text-sm transition ${
            option.active
              ? "bg-ink text-parchment"
              : "bg-white/70 text-stone ring-1 ring-ink/10 hover:text-ink"
          }`}
        >
          {option.label}
          <span className="ml-1.5 text-xs opacity-60">{option.count}</span>
        </a>
      ))}
    </nav>
  );
}

function Install({ kit }: { kit: KitListing }) {
  if (!kit.repository) {
    return (
      <p className="text-xs text-stone">
        Comes with <code className="font-mono text-ink">ens init</code>
      </p>
    );
  }
  return (
    <code className="block overflow-hidden text-ellipsis whitespace-nowrap rounded-lg bg-marble px-3 py-2 font-mono text-xs text-ink">
      <span className="select-none text-aegean">$</span>
      ens kit install {kit.repository}
    </code>
  );
}

/** Each card is the same height: longer text is cut with an ellipsis, and badges past these counts fold into a "+n" badge. */
const MAX_FACTS = 2;
const MAX_BADGES = 3;

function Badges({ values }: { values: string[] }) {
  const shown = values.slice(0, MAX_BADGES);
  const hidden = values.length - shown.length;
  return (
    <ul className="mt-1.5 flex flex-nowrap gap-1.5 overflow-hidden">
      {shown.map((value) => (
        <li
          key={value}
          title={value}
          className="max-w-[9rem] truncate rounded-full bg-marble px-2.5 py-0.5 font-mono text-[11px] text-ink/80"
        >
          {value}
        </li>
      ))}
      {hidden > 0 && (
        <li
          title={values.slice(MAX_BADGES).join(", ")}
          className="shrink-0 rounded-full bg-ochre/10 px-2.5 py-0.5 font-mono text-[11px] text-ochre"
        >
          +{hidden}
        </li>
      )}
    </ul>
  );
}

function KitCard({ kit, order }: { kit: KitListing; order: number }) {
  return (
    <article
      id={`${kit.role}-${kit.name}`}
      style={{ animationDelay: `${300 + Math.min(order, 8) * 70}ms` }}
      className="group rise flex h-[22rem] flex-col overflow-hidden rounded-2xl border border-ink/8 bg-white/80 p-5 backdrop-blur-sm transition duration-300 hover:[transform:translateY(-4px)] hover:shadow-lg hover:shadow-ochre/10"
    >
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-marble">
          {kit.iconUrl
            ? (
              <img
                src={kit.iconUrl}
                alt=""
                className="h-7 w-7 transition duration-300 group-hover:scale-110 group-hover:-rotate-6"
              />
            )
            : (
              <span className="font-serif text-xl text-ochre">
                {kit.title[0]}
              </span>
            )}
        </div>
        <div className="min-w-0 flex-1">
          <h3
            title={kit.title}
            className="truncate font-serif text-lg leading-tight text-ink"
          >
            {kit.title}
          </h3>
          <p className="mt-0.5 truncate font-mono text-xs text-stone">
            {kit.role}/{kit.name}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide uppercase ${
            ROLE_TONE[kit.role]
          }`}
        >
          {ROLE_LABEL[kit.role]}
        </span>
      </div>

      <p
        title={kit.summary}
        className="mt-4 line-clamp-3 text-sm leading-relaxed text-stone"
      >
        {kit.summary}
      </p>

      {kit.facts.slice(0, MAX_FACTS).map((fact) => (
        <div key={fact.label} className="mt-4">
          <p className="truncate text-[11px] font-semibold tracking-widest text-ink/50 uppercase">
            {fact.label}
          </p>
          <Badges values={fact.values} />
        </div>
      ))}

      <div className="mt-auto pt-5">
        {kit.tags.length > 0 && (
          <p className="mb-3 truncate text-xs text-stone">
            {kit.tags.map((tag) => `#${tag}`).join("  ")}
          </p>
        )}
        <Install kit={kit} />
      </div>
    </article>
  );
}

/** The official kits, as their `about:` sections present them. */
export function Kits({ kits, role }: KitsProps) {
  const shown = role ? kits.filter((kit) => kit.role === role) : kits;
  const blurb = ROLES.find((entry) => entry.role === role)?.blurb;
  return (
    <div className="min-h-screen overflow-x-clip bg-parchment font-sans text-ink antialiased">
      <Meander className="text-ochre/35" />
      <SiteNav />
      <Accented accents={HEADER_ACCENTS}>
        <header className="rise px-4 pt-12 pb-6 sm:px-6">
          <SectionHeading
            kicker="Kits"
            title="The instruments of the ensemble"
            lede={blurb
              ? `${ROLE_LABEL[role!]} kits ${blurb}.`
              : "Kits do the real work behind ens build, pack and deploy, each behind one contract. These are the official ones."}
          />
          <RoleFilter kits={kits} role={role} />
        </header>
      </Accented>
      <main className="mx-auto max-w-6xl px-4 pt-6 pb-24 sm:px-6">
        {shown.length === 0
          ? <p className="text-center text-stone">No kits to show yet.</p>
          : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((kit, order) => (
                <KitCard
                  key={`${kit.role}/${kit.name}`}
                  kit={kit}
                  order={order}
                />
              ))}
            </div>
          )}
      </main>
      <SiteFooter />
    </div>
  );
}
