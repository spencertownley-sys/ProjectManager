import { create } from "zustand";

/** Commands the Gantt and Timeline command bar options send to the mounted view (fit, scroll, export). */
export type TimelineCommand = "fit" | "today" | "scroll-selected" | "export-png-visible" | "export-png-full" | "export-pdf";

type TimelineCommandState = {
  handler: ((command: TimelineCommand) => void) | null;
  /** The mounted view registers the function that runs commands. */
  register: (handler: ((command: TimelineCommand) => void) | null) => void;
  send: (command: TimelineCommand) => void;
};

export const useTimelineCommands = create<TimelineCommandState>((set, get) => ({
  handler: null,
  register: (handler) => set({ handler }),
  send: (command) => get().handler?.(command),
}));
