import type { Id } from "../architecture.ts";
import type { Position } from "./networks.ts";

/** A line from the entry using to the entry used. */
export interface Link {
  readonly from: Id;
  readonly to: Id;
}

/** How wide a lane is, and how far apart two are, in reladraw's unit. */
const LANE_WIDTH = 0.5;
const LANE_GAP = 0.5;

/** How far above a row, in reladraw's unit, the first lane's line runs where it turns toward its lane or out of it, and how much further above each next lane's does, so the runs don't lie on one another. */
const ABOVE_ROW = 1.5;
const ABOVE_ROW_SPREAD = 0.7;

/**
 * The way lines take past the rows between the entry using and the entry
 * used, so they don't cross the boxes in those rows. Every row begins with the
 * same strip of lanes, one per such line, so a lane is at the same place in
 * every row; a line goes down its lane, from the gap above one row to the
 * gap above the next, and leaves it only in the gap above the row of the entry
 * it uses.
 */
export class Lanes {
  private readonly laneOf = new Map<string, number>();

  constructor(
    links: readonly Link[],
    private readonly positions: ReadonlyMap<Id, Position>,
    private readonly rowName: (rank: number) => string,
  ) {
    for (const link of links) {
      if (this.rowsPassed(link) === 0) continue;
      this.laneOf.set(this.keyOf(link), this.laneOf.size);
    }
  }

  get count(): number {
    return this.laneOf.size;
  }

  /** The strip that begins a row, `count` empty nodes in a row: the same width in every row, and in the topmost one the nodes the lines' points are placed against. */
  stripOf(rank: number): string[] {
    if (this.count === 0) return [];
    const strip = this.stripName(rank);
    return [
      `node ${strip} ""  shape: none  layout: row (gap: ${LANE_GAP})`,
      ...[...this.laneOf.values()].map((lane) =>
        `node ${strip}.l${lane} ""  shape: none  min-width: ${LANE_WIDTH}`
      ),
    ];
  }

  /** The reladraw statements for the points `link` goes through, placed above the rows from the one below the entry using to the one of the entry used. */
  pointsOf(link: Link, topRank: number): string[] {
    const lane = this.laneOf.get(this.keyOf(link));
    if (lane === undefined) return [];
    return this.ranksOf(link).map((rank) =>
      `guide point ${this.pointName(lane, rank)}  down from ${
        this.stripName(topRank)
      }.l${lane} and even with ${
        (ABOVE_ROW + ABOVE_ROW_SPREAD * lane).toFixed(1)
      } above ${this.rowName(rank)} top`
    );
  }

  /** The points `link` goes through, in order from the entry using. */
  routeOf(link: Link): string[] {
    const lane = this.laneOf.get(this.keyOf(link));
    if (lane === undefined) return [];
    return this.ranksOf(link).map((rank) => this.pointName(lane, rank));
  }

  private ranksOf(link: Link): number[] {
    const from = this.positions.get(link.from)!.rank;
    const to = this.positions.get(link.to)!.rank;
    return Array.from({ length: from - to }, (_, step) => from - 1 - step);
  }

  /** How many rows lie between the entries of a link that goes down. */
  private rowsPassed(link: Link): number {
    const from = this.positions.get(link.from)!.rank;
    const to = this.positions.get(link.to)!.rank;
    return Math.max(0, from - to - 1);
  }

  /** The first lane of the strip of the topmost row, or none where no line needs a lane. */
  firstLane(topRank: number): string | undefined {
    return this.count === 0 ? undefined : `${this.stripName(topRank)}.l0`;
  }

  private stripName(rank: number): string {
    return `${this.rowName(rank)}.strip`;
  }

  private pointName(lane: number, rank: number): string {
    return `lane${lane}_r${rank}`;
  }

  private keyOf(link: Link): string {
    return `${link.from}->${link.to}`;
  }
}
