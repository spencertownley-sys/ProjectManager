import { create } from "zustand";

type HelpState = {
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
};

/** Whether the keyboard shortcut sheet is open. Any component can open it (the ? key, the avatar menu, the help page). */
export const useHelpStore = create<HelpState>((set) => ({
  sheetOpen: false,
  setSheetOpen: (open) => set({ sheetOpen: open }),
}));
