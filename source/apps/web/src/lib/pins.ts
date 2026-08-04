import { useSyncExternalStore } from "react";

const PINS_STORAGE_KEY = "ensemble_dashboard_pinned_workflows";
const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedPins: string[] = [];

function readPins(): string[] {
  const raw = localStorage.getItem(PINS_STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedPins = raw ? JSON.parse(raw) : [];
    } catch {
      cachedPins = [];
    }
  }
  return cachedPins;
}

function writePins(pins: string[]): void {
  localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify(pins));
  for (const listener of listeners) listener();
}

export function isPinned(name: string): boolean {
  return readPins().includes(name);
}

export function togglePin(name: string): void {
  const pins = readPins();
  writePins(
    pins.includes(name) ? pins.filter((pin) => pin !== name) : [...pins, name],
  );
}

export function usePinnedWorkflows(): string[] {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    readPins,
  );
}
