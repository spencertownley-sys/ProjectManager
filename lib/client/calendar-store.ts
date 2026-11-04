import { create } from "zustand";

/** The day the Calendar is looking at, shared by the view and its command bar controls. Not persisted. */
type CalendarState = {
  anchor: string | null;
  setAnchor: (iso: string) => void;
};

export const useCalendarStore = create<CalendarState>((set) => ({
  anchor: null,
  setAnchor: (iso) => set({ anchor: iso }),
}));
