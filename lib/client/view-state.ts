import { create } from "zustand";

type ViewState = {
  selectedIds: string[];
  anchorId: string | null;
  openTaskId: string | null;
  focusedId: string | null;
  select: (ids: string[], anchor?: string | null) => void;
  toggle: (id: string) => void;
  clearSelection: () => void;
  openTask: (id: string | null) => void;
  focus: (id: string | null) => void;
};

export const useViewState = create<ViewState>((set) => ({
  selectedIds: [],
  anchorId: null,
  openTaskId: null,
  focusedId: null,
  select: (ids, anchor = null) => set({ selectedIds: ids, anchorId: anchor ?? ids[0] ?? null }),
  toggle: (id) => set((s) => ({ selectedIds: s.selectedIds.includes(id) ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id], anchorId: id })),
  clearSelection: () => set({ selectedIds: [], anchorId: null }),
  openTask: (id) => set({ openTaskId: id }),
  focus: (id) => set({ focusedId: id }),
}));

type ShellState = {
  railCollapsed: boolean;
  paneWidth: number;
  density: "compact" | "default" | "comfortable";
  setRailCollapsed: (v: boolean) => void;
  setPaneWidth: (w: number) => void;
  setDensity: (d: ShellState["density"]) => void;
};

const read = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
};

export const useShellState = create<ShellState>((set) => ({
  railCollapsed: read("tp-rail-collapsed", false),
  paneWidth: read("tp-pane-width", 480),
  density: read("tp-density", "default"),
  setRailCollapsed: (v) => {
    write("tp-rail-collapsed", v);
    set({ railCollapsed: v });
  },
  setPaneWidth: (w) => {
    const clamped = Math.min(640, Math.max(360, w));
    write("tp-pane-width", clamped);
    set({ paneWidth: clamped });
  },
  setDensity: (d) => {
    write("tp-density", d);
    set({ density: d });
  },
}));
