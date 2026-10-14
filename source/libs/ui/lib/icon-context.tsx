// ---------------------------------------------------------------------------
// Components never import an icon directly: they ask for one by the role it
// plays (`useIcon("chevron-down")`). That keeps the icon set swappable in one
// place, so an app on another library wraps its tree in IconProvider and
// every component follows. This kit defaults to Untitled UI (see
// untitled-icons.ts), which Fluid Functionalism prefers.
// ---------------------------------------------------------------------------

import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from "react";

import { untitledIcons } from "./untitled-icons.ts";

// The whole contract an icon has to meet. Components pass `strokeWidth` and
// also animate stroke width through `className` (1.5 → 2 on hover is a
// common cue), so an icon from another library should forward both to its
// `<svg>`. A filled icon set ignores them and simply loses that cue.
export interface IconComponentProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export type IconComponent = ComponentType<IconComponentProps>;

// Names describe the role, not the glyph, so a library whose icon is called
// something else still fills the same slot (`more-horizontal` is Untitled UI's
// DotsHorizontal).
export type IconName =
  | "chevron-right" | "chevron-down" | "x" | "copy" | "menu" | "dot"
  | "monitor" | "sun" | "moon" | "rectangle-horizontal" | "circle"
  | "square-library" | "clock" | "star" | "settings"
  | "plus" | "arrow-left" | "arrow-right" | "arrow-up" | "arrow-down"
  | "search" | "loader"
  | "users" | "lock" | "mail" | "bell" | "shield" | "palette"
  | "lightbulb" | "rocket" | "heart" | "paintbrush" | "brain"
  | "globe" | "user"
  | "image" | "link" | "check" | "rotate-ccw"
  | "play" | "pause" | "pipette"
  | "home" | "message-circle" | "inbox"
  | "pencil" | "scaling" | "skip-forward" | "corner-down-right" | "corner-down-left"
  | "panel-left" | "panel-right" | "chevrons-up-down" | "more-horizontal" | "more-vertical" | "calendar" | "folder"
  | "sliders-horizontal" | "info";

export const defaultIcons: Record<IconName, IconComponent> = untitledIcons;

const IconContext = createContext<Record<IconName, IconComponent> | null>(null);

/**
 * Returns a single icon component for the given name.
 * Falls back to the default (Untitled UI) set if no provider is present, so a
 * component works on its own before any IconProvider is set up.
 */
function useIcon(name: IconName): IconComponent {
  const icons = useContext(IconContext);
  return (icons ?? defaultIcons)[name];
}

/**
 * Returns the full icon map.
 * Falls back to the default (Untitled UI) set if no provider is present.
 */
function useIcons(): Record<IconName, IconComponent> {
  const icons = useContext(IconContext);
  return icons ?? defaultIcons;
}

/**
 * Swap some or all icons for components from another library.
 * Names left out of `icons` keep their default (Untitled UI) component, so a
 * partial map never leaves a component without an icon.
 *
 * Pass a stable `icons` object (module scope or memoized): an inline object
 * is new on every render and re-renders every component that reads an icon.
 */
function IconProvider({
  children,
  icons,
}: {
  children: ReactNode;
  icons?: Partial<Record<IconName, IconComponent>>;
}) {
  const value = useMemo(() => ({ ...defaultIcons, ...icons }), [icons]);
  return <IconContext.Provider value={value}>{children}</IconContext.Provider>;
}

export { IconProvider, useIcon, useIcons };
