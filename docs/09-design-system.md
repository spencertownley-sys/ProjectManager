# 09. Design System

Version 1.0, 03 Nov 2026. Owner: Design.

## 1. Design intent

TaskParty should feel like a first-party member of the Microsoft 365 family: Planner, Project for the web, Loop, Teams, and Outlook. Quiet surfaces, one accent, text that does the work, dense but legible data. Users should never notice the interface; they should notice their work.

Explicit anti-goals, because they are what makes software look generated rather than designed:

- No gradient hero backgrounds, glassmorphism, glowing borders, or oversized rounded corners.
- No emoji in UI chrome. Icons come from one icon set.
- No mixed font families. One family, one ramp.
- No purple-to-blue accent gradients, no neon.
- No decorative illustrations in the application; a small, consistent set of line illustrations only for empty states.
- No dashes used as separators in copy. Use colons, periods, or spacing.
- No "card inside card inside card" nesting. Maximum two surface levels on a screen.
- No centered page layouts in the application; content is left-aligned on a grid.

## 2. Typography

### 2.1 Families

Primary: **Segoe UI**. Segoe UI is a system font on Windows and inside Microsoft 365 applications and is not licensed for web embedding, so it is referenced through the system stack and never self-hosted.

Fallback chain in order: Segoe UI Variable Text, Segoe UI, Aptos, Calibri, Selawik (self-hosted, see below), Helvetica Neue, Arial, sans-serif.

Selawik is Microsoft's open-source (SIL OFL) typeface that is metric-compatible with Segoe UI. It is self-hosted at `/public/fonts/selawik-*.woff2` so that macOS, Linux, and mobile users see the same spacing and line breaks as Windows users.

Monospace (task keys, code blocks, API docs): **Cascadia Code** (open source, Microsoft) self-hosted, falling back to Consolas, Menlo, monospace.

Marketing site headings may use **Aptos Display** where installed, falling back to Segoe UI Semibold; no other display face is permitted.

```css
:root {
  --font-sans: "Segoe UI Variable Text", "Segoe UI", Aptos, Calibri, Selawik, "Helvetica Neue", Arial, sans-serif;
  --font-mono: "Cascadia Code", Consolas, Menlo, monospace;
}
```

### 2.2 Type ramp (Fluent 2 web ramp)

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| caption-2 | 10 / 14 | 400 | Timestamps in dense tables, axis labels |
| caption-1 | 12 / 16 | 400 | Metadata, helper text, column headers |
| caption-1-strong | 12 / 16 | 600 | Badges, table headers |
| body-1 | 14 / 20 | 400 | Default UI text, table cells, task titles in List |
| body-1-strong | 14 / 20 | 600 | Emphasized labels, selected nav items |
| subtitle-2 | 16 / 22 | 600 | Card titles, pane section headers |
| subtitle-1 | 20 / 26 | 600 | Page titles in panes, dialog titles |
| title-3 | 24 / 32 | 600 | Project name in header |
| title-2 | 28 / 36 | 600 | Workspace home greeting |
| title-1 | 32 / 40 | 600 | Marketing section titles |
| large-title | 40 / 52 | 600 | Marketing page titles |
| display | 68 / 92 | 600 | Marketing hero only |

Rules: body text is 14px everywhere in the application. Nothing in the application exceeds title-3. Semibold (600) is the only heading weight; bold (700) appears only in caption-1-stronger for status badges. Letter spacing is default; never tracked out.

## 3. Color

### 3.1 Brand and accent

Brand accent: `#0F6CBD` (Fluent brand 80). It is used for primary buttons, links, selected states, focus rings, and the critical path highlight. Nothing else is blue.

| Token | Light | Dark |
|---|---|---|
| brand-primary | #0F6CBD | #479EF5 |
| brand-primary-hover | #115EA3 | #62ABF5 |
| brand-primary-pressed | #0C3B5E | #2886DE |
| brand-tint | #EBF3FC | #0C2A45 |

### 3.2 Neutrals

| Token | Light | Dark | Use |
|---|---|---|---|
| bg-canvas | #F5F5F5 | #1B1B1B | Application background behind panels |
| bg-surface | #FFFFFF | #292929 | Panels, tables, cards |
| bg-surface-raised | #FFFFFF | #333333 | Menus, dialogs, task pane |
| bg-subtle | #FAFAFA | #242424 | Alternate rows, group headers |
| bg-hover | #F0F0F0 | #383838 | Row and button hover |
| bg-pressed | #E0E0E0 | #424242 | Pressed |
| bg-selected | #EBF3FC | #0C2A45 | Selected row, active nav |
| border-default | #E0E0E0 | #3D3D3D | Dividers, table lines |
| border-strong | #BDBDBD | #666666 | Input borders |
| text-primary | #242424 | #FFFFFF | Body text |
| text-secondary | #616161 | #D6D6D6 | Metadata |
| text-tertiary | #8A8A8A | #ADADAD | Placeholders, disabled |
| text-on-brand | #FFFFFF | #000000 | Text on accent |

### 3.3 Semantic

| Token | Light | Dark | Use |
|---|---|---|---|
| success | #107C10 | #54B054 | On track, done |
| success-tint | #E6F2E6 | #0B2E0B | |
| warning | #BC4B09 | #F7630C | At risk, due soon |
| warning-tint | #FDF3EC | #3A1A05 | |
| danger | #C50F1F | #DC626D | Off track, overdue, destructive |
| danger-tint | #FDF3F4 | #3B0B0F | |
| info | #0F6CBD | #479EF5 | |
| neutral-status | #8A8A8A | #ADADAD | Backlog, on hold |

### 3.4 Status and tag palette

Twelve named colors for statuses, tags, select options, and project colors, each with a tint. Users pick by name, never a hex value.

Blue #0F6CBD, Teal #038387, Green #107C10, Lime #5C9A1B, Yellow #C19C00, Orange #CA5010, Red #C50F1F, Berry #C239B3, Purple #8764B8, Navy #003966, Gray #616161, Brown #8E562E.

All status badge text is text-primary on the tint, never white on the full color, to keep contrast above 4.5:1.

## 4. Spacing, sizing, shape

- Base unit 4px. Spacing scale: 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Corner radius: 4px for inputs, buttons, badges, cards; 8px for dialogs, menus, the task pane; 2px for checkboxes; circles for avatars.
- Border width 1px. Elevation uses borders first; shadows only on floating surfaces: menu `0 4px 8px rgba(0,0,0,0.14)`, dialog `0 8px 16px rgba(0,0,0,0.14)`.
- Control heights: 32px default (buttons, inputs, selects), 24px compact (inline in tables), 40px large (marketing CTAs only).
- Table row height 36px default, 44px comfortable, 28px compact (user setting).
- Icon sizes 16px in controls and tables, 20px in navigation and headers, 24px in empty states.
- Focus ring: 2px solid brand-primary with 2px offset, visible on keyboard focus only (`:focus-visible`).

## 5. Layout

Application shell (document 10, section 1):

```
+----+------------------------------------------------------------------+
| N  | Top bar: workspace switcher | search (Ctrl+K) | inbox | avatar     |
| a  +------------------------------------------------------------------+
| v  | Project header: icon, name, members, status chip, Share, ...      |
|    | View tabs: List Board Table Gantt Timeline Calendar + Saved views |
| r  | Command bar: + Add task | Filter | Sort | Group | Fields | ...     |
| a  +------------------------------------------------+-----------------+
| i  |                                                | Task pane        |
| l  |  View content (virtualized)                    | (resizable,      |
|    |                                                |  360 to 640 px)  |
+----+------------------------------------------------+-----------------+
```

- Navigation rail 48px collapsed, 240px expanded; persisted per user.
- Top bar 48px. Project header 56px. View tabs 40px. Command bar 40px.
- Content uses the full remaining width; no max-width container in the application.
- Breakpoints: 360 (mobile), 768 (tablet), 1024 (desktop), 1440 (wide). Below 768 the rail becomes a bottom bar and the task pane becomes a full-screen sheet.

## 6. Components

All primitives are built on Radix through shadcn/ui and restyled with the tokens above. Component names and the states each must implement:

| Component | Variants | States |
|---|---|---|
| Button | primary, secondary (outline), subtle (ghost), danger, icon-only | default, hover, pressed, focus, disabled, loading |
| Input, Textarea | default, compact, inline (borderless until focus) | default, focus, invalid, disabled, read-only |
| Select, Combobox | single, multi, with search, with create option | same as input |
| Date picker | single date, range, with time | today marker, disabled dates |
| Person picker | single, multi | avatar plus name, "me" shortcut |
| Checkbox, Switch, Radio | | checked, indeterminate |
| Badge | status (tinted), count, tag | |
| Avatar, Avatar group | 20, 24, 32, 40 px; initials fallback; presence dot | |
| Menu, Context menu | with sections, shortcuts, submenus | |
| Dialog | small 480, medium 640, large 960 | |
| Sheet (side pane) | right, resizable | |
| Toast | info, success, warning, danger, with undo action | |
| Tooltip | 300 ms delay | |
| Tabs | underline style for views, pill style in panes | |
| Command palette | | |
| Table | virtualized, resizable columns, sticky header and first column, row selection, inline edit | |
| Card (Board) | compact, standard, detailed | drag, hover, selected |
| Progress bar, Progress ring | | |
| Empty state | icon, title, one sentence, primary action | |
| Skeleton | row, card, bar | |
| Breadcrumb | | |
| Keyboard key cap | | |

Icons: Fluent UI System Icons (MIT), Regular weight at 16 and 20; Filled weight for the active navigation item only.

## 7. Motion

- Durations: 100 ms for hover and pressed, 150 ms for menus and toasts, 200 ms for pane open and view switch, 250 ms for dialogs.
- Easing: `cubic-bezier(0.33, 0, 0.67, 1)` for standard, `cubic-bezier(0, 0, 0, 1)` for decelerate on enter.
- Drag: the dragged item lifts with the menu shadow at 0.95 opacity; drop targets show a 2px accent insertion line, never a filled highlight.
- Respect `prefers-reduced-motion`: disable transforms, keep opacity fades.
- No bounce, no spring overshoot, no parallax.

## 8. Writing style for UI copy

- Sentence case for everything, including buttons and headings. "Add task", not "Add Task".
- Verbs on buttons; nouns on tabs.
- No exclamation marks. No dashes. Oxford comma.
- Empty states say what the view shows and offer one action: "No tasks are due this week. Add a task."
- Errors say what happened and what to do: "The file is larger than 100 MB. Choose a smaller file."
- Confirmations for destructive actions name the object: "Delete MKT-142 and its 4 subtasks?"
- Relative times within 7 days ("Yesterday", "In 3 days"), absolute beyond ("12 Nov").

## 9. Accessibility

- WCAG 2.2 AA. Contrast 4.5:1 for text, 3:1 for UI boundaries and focus indicators.
- Every interactive element reachable and operable by keyboard, including drag operations (arrow keys move, Space picks up and drops, Escape cancels).
- Board columns are `role="list"` with cards as `role="listitem"`; Gantt bars are focusable with an accessible name "Task title, 10 Nov to 14 Nov, In progress".
- Live regions announce drag results and optimistic save failures.
- Color never carries meaning alone: statuses show a name, overdue shows an icon.
- Minimum touch target 24 by 24 CSS px in the application, 44 by 44 on the marketing site.
- Respect reduced motion and high contrast (`forced-colors`): borders remain visible, custom colors yield to system colors.

## 10. Dark mode

Follows the system by default; user can override. Tokens in section 3 provide both themes. Status colors shift to their dark values; tints darken. Shadows are replaced by 1px borders in dark mode.

## 11. Token implementation

Tokens are CSS custom properties on `:root` and `[data-theme="dark"]` in `/app/globals.css`, consumed by Tailwind through `@theme` so classes like `bg-surface`, `text-secondary`, `border-default`, and `rounded-md` resolve to the tokens. Component code never uses raw hex values; a lint rule (`no-raw-color`) in ESLint blocks them.
