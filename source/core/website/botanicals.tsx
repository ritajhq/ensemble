import type { ReactNode } from "react";

/**
 * Garlands composed from cut-outs of public-domain botanical plates (Köhler,
 * Redouté and others — credited where website/server embeds them), served at
 * /botanicals/<name>.webp.
 *
 * A composition is a box of fixed aspect ratio; every piece sits at a point
 * given in percent of the box and is sized in percent of its width, so the
 * whole arrangement scales as one.
 */

type Plant =
  | "anemones"
  | "crocus"
  | "jasmine"
  | "laurel"
  | "myrtle-berries"
  | "myrtle-flower"
  | "olive-branch"
  | "pomegranate"
  | "vinca";

interface Piece {
  plant: Plant;
  /** Center of the piece, in percent of the box. */
  x: number;
  y: number;
  /** Width of the piece, in percent of the box's width. */
  width: number;
  rotate: number;
  flip?: boolean;
  /** Stacking order within its side; later plates cover earlier ones. */
  layer: number;
}

function PlantImage({ piece, delay }: { piece: Piece; delay: number }) {
  const flip = piece.flip ? " scaleX(-1)" : "";
  return (
    <img
      src={`/botanicals/${piece.plant}.webp`}
      alt=""
      draggable={false}
      decoding="async"
      className="botanical-grow pointer-events-none absolute h-auto max-w-none select-none"
      style={{
        animationDelay: `${delay}ms`,
        left: `${piece.x}%`,
        top: `${piece.y}%`,
        width: `${piece.width}%`,
        zIndex: piece.layer,
        transform: `translate(-50%, -50%) rotate(${piece.rotate}deg)${flip}`,
      }}
    />
  );
}

const SWAY =
  "animate-[botanical-sway_10s_ease-in-out_infinite_alternate] motion-reduce:animate-none";

interface SideProps {
  pieces: Piece[];
  mirrored: boolean;
}

/**
 * One half of a composition, laid out as the left half: the right half is
 * the same coordinates mirrored, so a piece's x always counts outward from
 * the left edge toward the center line at 50%.
 */
function Side({ pieces, mirrored }: SideProps) {
  return (
    <div
      className={`absolute inset-0 ${mirrored ? "-scale-x-100" : ""}`}
    >
      <div
        className={`absolute inset-0 ${SWAY}`}
        style={{
          transformOrigin: "50% 80%",
          animationDelay: mirrored ? "-5s" : "0s",
        }}
      >
        {pieces.map((piece, index) => (
          <PlantImage
            key={index}
            piece={piece}
            delay={(mirrored ? 120 : 0) + piece.layer * 140}
          />
        ))}
      </div>
    </div>
  );
}

interface CompositionProps {
  left: Piece[];
  right: Piece[];
  /** Width over height of the box the pieces are placed in. */
  aspect: string;
  className?: string;
}

function Composition(
  { left, right, aspect, className = "" }: CompositionProps,
) {
  return (
    <div
      aria-hidden="true"
      className={`relative ${className}`}
      style={{ aspectRatio: aspect }}
    >
      <Side pieces={left} mirrored={false} />
      <Side pieces={right} mirrored />
    </div>
  );
}

/**
 * The hero garland: every plant turned so its stem lies past the screen's
 * edge, so they grow in from the sides toward the wordmark. Olive, laurel and
 * anemones come in from the left; olive, pomegranate and myrtle from the right.
 */
const GARLAND_LEFT: Piece[] = [
  { plant: "laurel", x: 7, y: 30, width: 18, rotate: 46, layer: 1 },
  { plant: "olive-branch", x: 9, y: 50, width: 31, rotate: 86, layer: 2 },
  { plant: "myrtle-flower", x: 3, y: 86, width: 8, rotate: 64, layer: 3 },
  { plant: "anemones", x: 16, y: 80, width: 20, rotate: 40, layer: 4 },
];

const GARLAND_RIGHT: Piece[] = [
  { plant: "myrtle-berries", x: 5, y: 30, width: 12, rotate: 76, layer: 1 },
  { plant: "olive-branch", x: 10, y: 50, width: 29, rotate: 94, layer: 2 },
  { plant: "laurel", x: 4, y: 88, width: 15, rotate: 58, layer: 3 },
  {
    plant: "pomegranate",
    x: 17,
    y: 74,
    width: 22,
    rotate: 34,
    flip: true,
    layer: 4,
  },
];

export function Garland({ className = "" }: { className?: string }) {
  return (
    <Composition
      left={GARLAND_LEFT}
      right={GARLAND_RIGHT}
      aspect="1440 / 430"
      className={className}
    />
  );
}

type Edge = "left" | "right";

/** A plant growing in from one edge of the page, beside a section. */
export interface Accent {
  plant: Plant;
  edge: Edge;
  /** Where its center sits, in percent of the section's height. */
  top: number;
  /** Its width, in percent of the viewport. */
  width: number;
  /** How far its center sits past the edge, in percent of the viewport. */
  inset: number;
  rotate: number;
  flip?: boolean;
}

function AccentImage({ accent }: { accent: Accent }) {
  const flip = accent.flip ? " scaleX(-1)" : "";
  return (
    <img
      src={`/botanicals/${accent.plant}.webp`}
      alt=""
      draggable={false}
      decoding="async"
      loading="lazy"
      className="botanical-reveal pointer-events-none absolute h-auto max-w-none select-none"
      style={{
        ["--enter-x" as string]: accent.edge === "left" ? "-10vw" : "10vw",
        top: `${accent.top}%`,
        [accent.edge]: `${accent.inset}vw`,
        width: `${accent.width}vw`,
        transform: `translate(${
          accent.edge === "left" ? "-50%" : "50%"
        }, -50%) rotate(${accent.rotate}deg)${flip}`,
      }}
    />
  );
}

interface AccentedProps {
  accents: Accent[];
  /** The section's background, painted under the plants so they stay visible. */
  className?: string;
  children: ReactNode;
}

/**
 * A section with plants growing in from the page edges behind it: they fill
 * the margins and show softly through the section's translucent cards. Only
 * on wide screens, where there's margin for them.
 */
export function Accented({ accents, className = "", children }: AccentedProps) {
  return (
    <div className={`relative isolate ${className}`}>
      <div aria-hidden="true" className="absolute inset-0 hidden lg:block">
        {accents.map((accent, index) => (
          <AccentImage key={index} accent={accent} />
        ))}
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
