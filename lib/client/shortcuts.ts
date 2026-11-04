/** Keyboard shortcuts as documented in docs/10 section 1 and docs/11 section 1. Rendered by the sheet and the help page. */

export type Shortcut = { keys: string[]; label: string; sequence?: boolean };
export type ShortcutGroup = { title: string; items: Shortcut[] };

export const shortcutGroups: ShortcutGroup[] = [
  {
    title: "Global",
    items: [
      { keys: ["Ctrl", "K"], label: "Search or jump to anything" },
      { keys: ["N"], label: "New task" },
      { keys: ["?"], label: "Show this sheet" },
      { keys: ["["], label: "Collapse or expand the navigation" },
      { keys: ["]"], label: "Toggle the details pane" },
      { keys: ["Esc"], label: "Close the pane or cancel" },
      { keys: ["Ctrl", "Z"], label: "Undo the last change" },
    ],
  },
  {
    title: "Go to",
    items: [
      { keys: ["G", "H"], label: "Home", sequence: true },
      { keys: ["G", "M"], label: "My work", sequence: true },
      { keys: ["G", "I"], label: "Inbox", sequence: true },
      { keys: ["G", "P"], label: "All projects", sequence: true },
      { keys: ["G", "S"], label: "Settings", sequence: true },
      { keys: ["1"], label: "View tabs in order, 1 to 8" },
    ],
  },
  {
    title: "Tasks",
    items: [
      { keys: ["J"], label: "Focus the next task" },
      { keys: ["K"], label: "Focus the previous task" },
      { keys: ["Enter"], label: "Open the focused task" },
      { keys: ["E"], label: "Edit the title" },
      { keys: ["A"], label: "Assign" },
      { keys: ["S"], label: "Set status" },
      { keys: ["D"], label: "Set due date" },
      { keys: ["P"], label: "Set priority" },
      { keys: ["C"], label: "Comment" },
      { keys: ["X"], label: "Select" },
      { keys: ["Shift", "X"], label: "Select a range" },
      { keys: ["Delete"], label: "Delete with confirmation" },
    ],
  },
  {
    title: "Quick add",
    items: [
      { keys: ["Enter"], label: "Create the task" },
      { keys: ["Shift", "Enter"], label: "Create and keep the composer open" },
      { keys: ["Esc"], label: "Cancel" },
    ],
  },
  {
    title: "Table",
    items: [
      { keys: ["Arrows"], label: "Move between cells" },
      { keys: ["Tab"], label: "Next cell" },
      { keys: ["Enter"], label: "Edit the cell" },
      { keys: ["Ctrl", "V"], label: "Paste rows from a spreadsheet" },
      { keys: ["Delete"], label: "Clear the cell" },
    ],
  },
  {
    title: "Timeline and Gantt",
    items: [
      { keys: ["Ctrl", "Wheel"], label: "Zoom" },
      { keys: ["T"], label: "Scroll to today" },
      { keys: ["F"], label: "Fit the project" },
      { keys: ["Shift", "Arrows"], label: "Move the selected bar by a day" },
      { keys: ["Alt", "Arrows"], label: "Resize the selected bar" },
    ],
  },
];

/** True when the key press should open the shortcut sheet: a question mark outside any text input. */
export function isShortcutSheetKey(e: { key: string; target: EventTarget | null; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return false;
  const el = e.target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return true;
  return !el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='textbox'], [role='combobox']");
}
