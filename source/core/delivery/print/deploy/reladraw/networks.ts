import type { Architecture, Entry, Id } from "../architecture.ts";
import type { Icon } from "../icons.ts";

/** Where an entry sits in the drawing: which row, its place in the order the rows are written, and about how big it is (in characters wide and lines high, since only reladraw knows the size it lays it out at). */
export interface Position {
  readonly rank: number;
  readonly order: number;
  readonly width: number;
  readonly height: number;
}

/** How many colors networks take before they repeat; each is a style, `network_<n>`. */
const PALETTE_SIZE = 4;

/** The type of an `external` entry that is a network. */
const NETWORK_TYPE = "network";

/** What a label's text is pushed right by so the network's icon fits before it: characters that are blank but not whitespace, which reladraw would trim. */
const ICON_ROOM = "\u2800".repeat(5);

/** The icon an area wears: the network's, not the external's its entry has. */
const NETWORK_ICON: Icon = "network";

/** The field of a compute that lists the networks it is attached to. */
const NETWORKS_FIELD = "networks";

/**
 * The networks an architecture's computes are attached to. A network isn't
 * drawn as a node: it is an area around the computes that use it, and a
 * compute on two networks sits where the two areas overlap. That is why a
 * compute is never drawn with a line to its network.
 */
export class Networks {
  private readonly networks: readonly Entry[];
  private readonly membersByNetwork: ReadonlyMap<Id, readonly Id[]>;

  constructor(private readonly architecture: Architecture) {
    this.networks = architecture.entries.filter((entry) =>
      entry.category === "external" && entry.type === NETWORK_TYPE
    );
    this.membersByNetwork = new Map(
      this.networks.map((network) => [network.id, this.membersOf(network.id)]),
    );
  }

  /** The icon of the networks drawn as areas, if any is: each has it beside its name, whatever icon its entry has (an `external`'s). */
  areaIcons(): Icon[] {
    return this.networks.some((network) =>
        this.membersByNetwork.get(network.id)!.length > 0
      )
      ? [NETWORK_ICON]
      : [];
  }

  /** Whether `entry` is drawn as an area rather than as a node. */
  isArea(entry: Entry): boolean {
    return this.membersByNetwork.has(entry.id);
  }

  /** `computes` with the ones on the same networks next to each other, so an area can be a rectangle around them; the order they were declared in otherwise holds. */
  grouped(computes: readonly Entry[]): Entry[] {
    const firstSeen = new Map<string, number>();
    computes.forEach((compute, index) => {
      const key = this.signatureOf(compute.id);
      if (!firstSeen.has(key)) firstSeen.set(key, index);
    });
    return computes
      .map((compute, index) => ({ compute, index }))
      .sort((a, b) =>
        firstSeen.get(this.signatureOf(a.compute.id))! -
          firstSeen.get(this.signatureOf(b.compute.id))! || a.index - b.index
      )
      .map(({ compute }) => compute);
  }

  /** One reladraw `region` per network that has a drawn compute: a rectangle round its members (and the lanes lines pass through, where the members stand in several rows), wider the more networks it holds inside it, and behind all of them (a region draws in front of the boxes it does not name). Each is spanned by two guide points, since its members may stand in several rows that are not equally wide. */
  regions(
    names: ReadonlyMap<Id, string>,
    positions: ReadonlyMap<Id, Position>,
    quoted: (text: string) => string,
    lanes?: string,
  ): string[] {
    const lines: string[] = [];
    this.networks.forEach((network, index) => {
      const members = this.membersByNetwork.get(network.id)!
        .filter((id) => positions.has(id));
      if (members.length === 0) return;
      const name = `network_${index}`;
      const { top, left, right, bottom } = this.edgesOf(members, positions);
      const spansRows = new Set(members.map((id) =>
        positions.get(id)!.rank
      )).size > 1;
      lines.push(
        `guide point ${name}_start  up from ${
          spansRows && lanes ? lanes : names.get(left)
        } left and even with ${spansRows && lanes ? "0.5 above " : ""}${
          names.get(top)
        } top`,
        `guide point ${name}_end  down from ${
          names.get(right)
        } right and even with ${names.get(bottom)} bottom`,
        `region ${name} ${
          quoted(`${ICON_ROOM}${network.name} network`)
        } (inside top, align: left)  ${name}_start to ${name}_end  padding: ${
          this.paddingOf(network.id)
        }  style: network_${index % PALETTE_SIZE}  depth: behind arch`,
        `guide point ${name}_icon_corner  1.6 below ${name} top-left`,
        `guide point ${name}_icon_place  2 right of ${name}_icon_corner`,
        `node ${name}_icon ""  icon: ${NETWORK_ICON}  on ${name}_icon_place`,
      );
    });
    return lines;
  }

  /** The members that reach furthest up, left, right and down, by where the rows put them: a row's boxes are laid out left to right from the same edge, and top-aligned. */
  private edgesOf(
    members: readonly Id[],
    positions: ReadonlyMap<Id, Position>,
  ): { top: Id; left: Id; right: Id; bottom: Id } {
    const at = (id: Id) => positions.get(id)!;
    const offsetOf = (id: Id) =>
      [...positions.values()]
        .filter((other) =>
          other.rank === at(id).rank && other.order < at(id).order
        )
        .reduce((total, other) => total + other.width, 0);
    const lowestFirst = (key: (id: Id) => number) => (a: Id, b: Id) =>
      key(a) - key(b) || at(a).order - at(b).order;
    return {
      top: [...members].sort(lowestFirst((id) => -at(id).rank))[0],
      left: [...members].sort(lowestFirst(offsetOf))[0],
      right: [...members].sort(
        lowestFirst((id) => -(offsetOf(id) + at(id).width)),
      )[0],
      bottom: [...members].sort(
        lowestFirst((id) => at(id).rank * 1000 - at(id).height),
      )[0],
    };
  }

  /** An area holding other areas needs more room than they do, or its border would run along theirs. */
  private paddingOf(network: Id): number {
    const members = new Set(this.membersByNetwork.get(network));
    const inside = [...this.membersByNetwork]
      .filter(([other, others]) =>
        other !== network && others.length < members.size &&
        others.every((id) => members.has(id))
      );
    return 2 + inside.length;
  }

  /** The computes whose `networks` field names `network`. */
  private membersOf(network: Id): Id[] {
    return [
      ...new Set(
        this.architecture.relations
          .filter((relation) =>
            relation.to === network &&
            relation.via.split(".")[0] === NETWORKS_FIELD
          )
          .map((relation) => relation.from),
      ),
    ];
  }

  private signatureOf(compute: Id): string {
    return this.networks
      .filter((network) =>
        this.membersByNetwork.get(network.id)!.includes(compute)
      )
      .map((network) => network.id)
      .join("|");
  }
}
