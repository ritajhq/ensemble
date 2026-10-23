import type { Architecture, Entry, Relation } from "../architecture.ts";
import { Colors } from "./colors.ts";
import { Flow } from "./flow.ts";
import { IconFiles } from "./icon-files.ts";
import { Lanes } from "./lanes.ts";
import { Networks, type Position } from "./networks.ts";
import { Theme } from "./theme.ts";

/** Drawn in a row of their own above all the others, so lines to them don't cross the rest. */
const OUTERMOST_ABOVE: readonly string[] = ["external"];

/** Not in the drawing at all, nor any line to them: nearly every compute uses some, and the lines would hide the rest. The page lists them instead. */
const UNDRAWN_CATEGORIES: readonly string[] = ["variables", "secrets"];

/** Entries of these categories sit straight in their row, with no titled group around them: what stands around them is the networks. */
const UNGROUPED_CATEGORIES: readonly string[] = ["compute"];

/** Which style dresses an entry of a category; a compute's is its color, and any other category has none. */
const STYLE_BY_CATEGORY: Readonly<Record<string, string>> = {
  external: "external",
};

/** The widest a line of an entry's text gets before it wraps, in characters. */
const WRAP = 44;

/** The entries of one row, by category. */
type Row = Map<string, Entry[]>;

/** Which of the lines between two rows a line is, and how many there are. */
interface Spread {
  readonly index: number;
  readonly count: number;
}

/** A line to draw: a relation, and whether the entry it points at also uses the entry it comes from. */
interface DrawnRelation {
  readonly relation: Relation;
  readonly bothWays: boolean;
}

/** Where between the box a line leaves and the box it reaches it turns, as a share of the way: near the box it leaves, so the run across lies in the open space beneath it and not over a network's name above the box it reaches. The lines between two rows turn at heights spread within this stretch. */
const TURN_FROM = 0.08;
const TURN_SPAN = 0.4;

/** How far above a row, in reladraw's unit, the first line between two boxes in it goes, and how much further each next one. */
const STEP_OUT = 3;
const STEP_OUT_SPREAD = 1.5;

/** Where every drawn entry is: its reladraw name, and its row and place in it. */
interface Placement {
  readonly names: Map<string, string>;
  readonly positions: Map<string, Position>;
}

/**
 * Writes the reladraw source that draws an `Architecture`: a row per layer
 * with the entries that use others on top and the externals in a row above them
 * all, and in each row a titled group per category (the computes stand
 * straight in theirs, inside the networks they are attached to). A relation is
 * a line from the entry using to the entry used.
 *
 * Reladraw names nest with dots, and an entry's id (`compute.api`) already has
 * one, so each entry is named by its position instead.
 */
export class Source {
  constructor(private readonly icons: IconFiles = new IconFiles()) {}

  /** `straight` names lines, as `<from> -> <to>` in reladraw names, to draw without a turn: reladraw refuses one on a line whose ends are level, since it runs straight. */
  write(
    architecture: Architecture,
    straight: ReadonlySet<string> = new Set(),
    theme: Theme = Theme.dark,
  ): string {
    const networks = new Networks(architecture);
    const colors = new Colors(architecture, theme);
    const rows = this.rowsOf(architecture, networks);
    const { names, positions } = this.placementOf(rows);
    const wanted = this.drawnRelations(architecture, names);
    const lanes = new Lanes(
      wanted.map(({ relation }) => relation),
      positions,
      (rank) => this.rowName(rank),
    );
    return [
      `diagram  theme: ${theme.base}`,
      "default edge  line: (path: square)",
      ...colors.declarations(),
      ...this.iconDeclarations(architecture, networks),
      "",
      ...this.nodes(rows, names, lanes, colors),
      "",
      ...networks.regions(
        names,
        positions,
        (text) => this.quoted(text),
        lanes.firstLane(Math.max(...rows.keys())),
      ),
      "",
      ...wanted.flatMap(({ relation }) =>
        lanes.pointsOf(relation, Math.max(...rows.keys()))
      ),
      ...this.edges(wanted, names, positions, lanes, colors, straight),
      "",
    ].join("\n");
  }

  private iconDeclarations(
    architecture: Architecture,
    networks: Networks,
  ): string[] {
    const used = [
      ...new Set(
        [
          ...this.drawn(architecture, networks).map((entry) => entry.icon),
          ...networks.areaIcons(),
        ],
      ),
    ]
      .sort();
    return used.map((icon) =>
      `icon ${icon} """\n${this.icons.svg(icon).trim()}\n"""`
    );
  }

  /** The rows, by rank counted from the bottom: one per layer, then the externals above all. */
  private rowsOf(
    architecture: Architecture,
    networks: Networks,
  ): Map<number, Row> {
    const flow = new Flow(architecture);
    const topLayer = Math.max(...architecture.entries.map((e) => e.layer)) +
      flow.deepest;
    const rows = new Map<number, Row>();
    const drawn = this.drawn(architecture, networks);
    const entries = [
      ...networks.grouped(drawn.filter((e) => e.category === "compute")),
      ...drawn.filter((e) => e.category !== "compute"),
    ];
    for (const entry of entries) {
      const rank = this.rankOf(entry, topLayer, flow);
      const row = rows.get(rank) ?? new Map<string, Entry[]>();
      row.set(entry.category, [...(row.get(entry.category) ?? []), entry]);
      rows.set(rank, row);
    }
    return rows;
  }

  private drawn(architecture: Architecture, networks: Networks): Entry[] {
    return architecture.entries.filter((entry) =>
      !UNDRAWN_CATEGORIES.includes(entry.category) && !networks.isArea(entry)
    );
  }

  /** A compute stands as many rows below the top as the calls leading to it; the rest by the layer they sit in. */
  private rankOf(entry: Entry, topLayer: number, flow: Flow): number {
    if (OUTERMOST_ABOVE.includes(entry.category)) return topLayer + 1;
    if (entry.category !== "compute") return entry.layer;
    return entry.layer + flow.deepest - flow.depthOf(entry.id);
  }

  /** Each entry's reladraw name, as `arch.r<rank>.<category>.e<n>` (without the category where there is no group), and where it sits. */
  private placementOf(rows: Map<number, Row>): Placement {
    const names = new Map<string, string>();
    const positions = new Map<string, Position>();
    let order = 0;
    for (const [rank, row] of rows) {
      for (const [category, entries] of row) {
        for (const entry of entries) {
          const parent = UNGROUPED_CATEGORIES.includes(category)
            ? this.rowName(rank)
            : this.groupName(rank, category);
          names.set(entry.id, `${parent}.e${order}`);
          positions.set(entry.id, {
            rank,
            order: order++,
            ...this.sizeOf(entry),
          });
        }
      }
    }
    return { names, positions };
  }

  /** About how big a box is: as wide as its longest line (a body's wrap at `WRAP`) and as high as its lines, plus the header. */
  private sizeOf(entry: Entry): { width: number; height: number } {
    const lines = [
      entry.type,
      ...(entry.description ? [entry.description] : []),
      ...entry.details.map((detail) => `${detail.label}: ${detail.value}`),
    ];
    return {
      width: Math.max(
        entry.name.length * 2,
        ...lines.map((line) => Math.min(line.length, WRAP)),
      ),
      height: 2 + lines.reduce(
        (total, line) => total + Math.ceil(line.length / WRAP),
        0,
      ),
    };
  }

  private rowName(rank: number): string {
    return `arch.r${rank}`;
  }

  private groupName(rank: number, category: string): string {
    return `${this.rowName(rank)}.${category}`;
  }

  private nodes(
    rows: Map<number, Row>,
    names: Map<string, string>,
    lanes: Lanes,
    colors: Colors,
  ): string[] {
    const lines = [
      'node arch ""  shape: none  layout: column (gap: wide, align-children: left)',
    ];
    const ranksTopDown = [...rows.keys()].sort((a, b) => b - a);
    for (const rank of ranksTopDown) {
      lines.push(
        `node ${
          this.rowName(rank)
        } ""  shape: none  layout: row (gap: wide, align-children: top)`,
      );
      lines.push(...lanes.stripOf(rank));
      for (const [category, entries] of rows.get(rank)!) {
        if (!UNGROUPED_CATEGORIES.includes(category)) {
          lines.push(this.group(rank, category));
        }
        for (const entry of entries) {
          lines.push(...this.node(entry, names.get(entry.id)!, colors));
        }
      }
    }
    return lines;
  }

  private group(rank: number, category: string): string {
    return `node ${this.groupName(rank, category)} ${
      this.quoted(category)
    }  layout: row (gap: normal)`;
  }

  /** An entry is a box with a header, the icon and the name large beside it, over a body of what else is worth knowing of it. */
  private node(entry: Entry, name: string, colors: Colors): string[] {
    const style = STYLE_BY_CATEGORY[entry.category] ??
      colors.styleOf(entry.id);
    return [
      [
        `node ${name} ""  layout: column (gap: tight, align-children: left)`,
        style ? `style: ${style}` : "",
      ].filter(Boolean).join("  "),
      `node ${name}.head ""  shape: none  layout: row (gap: tight)`,
      `node ${name}.head.icon  icon: ${entry.icon}`,
      `node ${name}.head.name ${
        this.quoted(entry.name)
      } (size: large, color: theme-text)  shape: none`,
      `node ${name}.body ${
        this.bodyOf(entry)
      } (wrap: ${WRAP}, align: left)  shape: none`,
    ];
  }

  /** The type in a quieter color, then the description and the details. */
  private bodyOf(entry: Entry): string {
    return `"${
      [
        `[muted]${this.escaped(entry.type)}[/muted]`,
        ...(entry.description ? [this.escaped(entry.description)] : []),
        ...entry.details.map((detail) =>
          this.escaped(`${detail.label}: ${detail.value}`)
        ),
      ].join(" / ")
    }"`;
  }

  private edges(
    wanted: readonly DrawnRelation[],
    names: Map<string, string>,
    positions: Map<string, Position>,
    lanes: Lanes,
    colors: Colors,
    straight: ReadonlySet<string>,
  ): string[] {
    return wanted.map((drawn) =>
      this.edge(
        drawn,
        names,
        positions,
        this.spreadOf(drawn, wanted, positions, lanes),
        this.arrivalOf(drawn, wanted, positions),
        lanes.routeOf(drawn.relation),
        colors,
        straight.has(
          `${names.get(drawn.relation.from)} -> ${
            names.get(drawn.relation.to)
          }`,
        ),
      )
    );
  }

  /** The relations between two drawn entries, once each; two that go opposite ways are one line with an arrow at both ends. */
  private drawnRelations(
    architecture: Architecture,
    names: Map<string, string>,
  ): DrawnRelation[] {
    const seen = new Set<string>();
    const drawn: DrawnRelation[] = [];
    for (const relation of architecture.relations) {
      if (!names.has(relation.from) || !names.has(relation.to)) continue;
      const bothWays = architecture.relations.some((other) =>
        other.from === relation.to && other.to === relation.from
      );
      const key = bothWays
        ? [relation.from, relation.to].sort().join("<->")
        : `${relation.from}->${relation.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      drawn.push({ relation, bothWays });
    }
    return drawn;
  }

  /** Which of the lines between the same two rows this is: each is drawn at a distance of its own, so a line can be followed instead of merging with the ones beside it. */
  private spreadOf(
    line: DrawnRelation,
    wanted: readonly DrawnRelation[],
    positions: Map<string, Position>,
    lanes: Lanes,
  ): Spread {
    const rowsOf = ({ relation }: DrawnRelation) =>
      `${positions.get(relation.from)!.rank}->${
        positions.get(relation.to)!.rank
      }`;
    const span = ({ relation }: DrawnRelation) =>
      Math.abs(
        positions.get(relation.from)!.order -
          positions.get(relation.to)!.order,
      );
    const between = wanted
      .filter((other) =>
        rowsOf(other) === rowsOf(line) &&
        !this.isBesideLine(other, positions) &&
        lanes.routeOf(other.relation).length === 0
      )
      .sort((a, b) =>
        // Between boxes in one row the shorter span goes lower, inside the longer ones.
        (positions.get(a.relation.from)!.rank ===
            positions.get(a.relation.to)!.rank
          ? span(a) - span(b)
          : 0) ||
        positions.get(a.relation.to)!.order -
          positions.get(b.relation.to)!.order ||
        positions.get(a.relation.from)!.order -
          positions.get(b.relation.from)!.order
      );
    return { index: between.indexOf(line), count: between.length };
  }

  private isBesideLine(
    { relation }: DrawnRelation,
    positions: Map<string, Position>,
  ): boolean {
    return this.isBeside(
      positions.get(relation.from)!,
      positions.get(relation.to)!,
    );
  }

  /** A line leaves by the side of its box that faces the row of the box it goes to, so it doesn't run across the boxes beside it, and goes through the lanes of the rows it passes; between two boxes side by side it runs straight across, and between two further apart in a row it goes over the top. */
  private edge(
    { relation, bothWays }: DrawnRelation,
    names: Map<string, string>,
    positions: Map<string, Position>,
    spread: Spread,
    arrival: Spread,
    route: readonly string[],
    colors: Colors,
    straight: boolean,
  ): string {
    const from = positions.get(relation.from)!;
    const to = positions.get(relation.to)!;
    const style = colors.styleOf(relation.from);
    return `edge ${names.get(relation.from)} ${bothWays ? "<->" : "->"} ${
      names.get(relation.to)
    }${this.sides(from, to, arrival)}  line: (path: square${
      route.length > 0 ? "" : this.shape(from, to, spread, straight)
    })${route.length > 0 ? `  via: ${route.join(", ")}` : ""}${
      style ? `  style: ${style}` : ""
    }`;
  }

  private shape(
    from: Position,
    to: Position,
    spread: Spread,
    straight: boolean,
  ): string {
    if (this.isBeside(from, to)) return "";
    if (from.rank === to.rank) {
      return `, step-out: ${
        (STEP_OUT + STEP_OUT_SPREAD * spread.index).toFixed(1)
      }`;
    }
    if (straight) return "";
    const along = TURN_FROM +
      TURN_SPAN * (spread.index + 1) / (spread.count + 1);
    return `, turn: ${along.toFixed(3)}`;
  }

  /** Which of the lines that come down onto the same box this is, from the left: they arrive on its right half, one place each, since an area's name is in the top-left of it. */
  private arrivalOf(
    line: DrawnRelation,
    wanted: readonly DrawnRelation[],
    positions: Map<string, Position>,
  ): Spread {
    const comingDown = ({ relation }: DrawnRelation) =>
      positions.get(relation.from)!.rank > positions.get(relation.to)!.rank;
    const arriving = wanted
      .filter((other) =>
        comingDown(other) && other.relation.to === line.relation.to
      )
      .sort((a, b) =>
        positions.get(a.relation.from)!.order -
        positions.get(b.relation.from)!.order
      );
    return { index: arriving.indexOf(line), count: arriving.length };
  }

  private sides(from: Position, to: Position, arrival: Spread): string {
    if (this.isBeside(from, to)) {
      return from.order < to.order
        ? "  from: right  to: left"
        : "  from: left  to: right";
    }
    if (from.rank > to.rank) {
      // The right half of the top side, in as many equal steps as lines arrive.
      const slots = 2 * (arrival.count + 1);
      return `  from: bottom  to: top ${
        arrival.count + 2 + arrival.index
      }/${slots} across`;
    }
    if (from.rank < to.rank) return "  from: top  to: bottom";
    return "  from: top  to: top";
  }

  /** Whether two boxes are next to each other in a row. */
  private isBeside(from: Position, to: Position): boolean {
    return from.rank === to.rank && Math.abs(from.order - to.order) === 1;
  }

  private quoted(text: string): string {
    return `"${this.escaped(text)}"`;
  }

  /** What the language reads as syntax in a text, escaped. */
  private escaped(text: string): string {
    return text
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("[", "\\[")
      .replaceAll(" / ", " \\/ ");
  }
}
