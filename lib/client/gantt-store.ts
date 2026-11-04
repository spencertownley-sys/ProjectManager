import { create } from "zustand";

/** Commands the Gantt command bar options send to the mounted Gantt view (fit, scroll, export). */
export type GanttCommand = "fit" | "today" | "scroll-selected" | "export-png-visible" | "export-png-full" | "export-pdf";

type GanttState = {
  handler: ((command: GanttCommand) => void) | null;
  /** The mounted Gantt view registers the function that runs commands. */
  register: (handler: ((command: GanttCommand) => void) | null) => void;
  send: (command: GanttCommand) => void;
};

export const useGanttStore = create<GanttState>((set, get) => ({
  handler: null,
  register: (handler) => set({ handler }),
  send: (command) => get().handler?.(command),
}));
