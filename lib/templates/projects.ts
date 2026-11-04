import type { ViewType } from "@/lib/db/schema";
import type { WorkflowTemplateKey } from "./workflows";

export type ProjectTemplate = {
  id: string;
  name: string;
  category: "Engineering" | "Marketing" | "Operations" | "Planning" | "Personal";
  description: string;
  workflow: WorkflowTemplateKey;
  defaultView: ViewType;
  sections: string[];
  /** Sample tasks with day offsets relative to project creation. */
  tasks: Array<{ title: string; section: number; startOffset?: number; dueOffset?: number; milestone?: boolean; estimate?: number }>;
};

export const projectTemplates: ProjectTemplate[] = [
  {
    id: "simple",
    name: "Simple project",
    category: "Personal",
    description: "A plain list with three statuses. Good for anything that does not need a process.",
    workflow: "simple",
    defaultView: "list",
    sections: ["To do", "In progress", "Done"],
    tasks: [],
  },
  {
    id: "kanban",
    name: "Kanban board",
    category: "Operations",
    description: "Continuous flow with work-in-progress limits and cycle time.",
    workflow: "kanban",
    defaultView: "board",
    sections: ["Work"],
    tasks: [],
  },
  {
    id: "scrum",
    name: "Scrum sprint",
    category: "Engineering",
    description: "Backlog, cycles, burndown, and velocity for a sprinting team.",
    workflow: "scrum",
    defaultView: "board",
    sections: ["Backlog", "Current cycle"],
    tasks: [],
  },
  {
    id: "shape_up",
    name: "Shape Up cycle",
    category: "Engineering",
    description: "Six-week cycles with pitches, bets, and cooldowns.",
    workflow: "shape_up",
    defaultView: "board",
    sections: ["Pitches", "Cycle"],
    tasks: [],
  },
  {
    id: "roadmap",
    name: "Product roadmap",
    category: "Planning",
    description: "Initiatives on a timeline with phases and approvals.",
    workflow: "phase_gate",
    defaultView: "timeline",
    sections: ["Now", "Next", "Later"],
    tasks: [
      { title: "Define quarterly themes", section: 0, startOffset: 0, dueOffset: 14 },
      { title: "Roadmap review with leadership", section: 0, dueOffset: 21, milestone: true },
    ],
  },
  {
    id: "campaign",
    name: "Marketing campaign",
    category: "Marketing",
    description: "Plan, produce, approve, and launch a campaign on a calendar.",
    workflow: "phase_gate",
    defaultView: "calendar",
    sections: ["Planning", "Production", "Launch", "Wrap-up"],
    tasks: [
      { title: "Campaign brief", section: 0, startOffset: 0, dueOffset: 5 },
      { title: "Creative concepts", section: 1, startOffset: 5, dueOffset: 15 },
      { title: "Launch day", section: 2, dueOffset: 30, milestone: true },
      { title: "Results report", section: 3, startOffset: 31, dueOffset: 40 },
    ],
  },
  {
    id: "content_calendar",
    name: "Content calendar",
    category: "Marketing",
    description: "Posts and articles by publish date with review status.",
    workflow: "simple",
    defaultView: "calendar",
    sections: ["Ideas", "Drafting", "Scheduled", "Published"],
    tasks: [],
  },
  {
    id: "event",
    name: "Event plan",
    category: "Operations",
    description: "Venue, vendors, and run-of-show on a Gantt chart with milestones.",
    workflow: "simple",
    defaultView: "gantt",
    sections: ["Venue and logistics", "Program", "Promotion", "Day of"],
    tasks: [
      { title: "Confirm venue", section: 0, startOffset: 0, dueOffset: 7 },
      { title: "Book catering", section: 0, startOffset: 7, dueOffset: 14 },
      { title: "Finalize agenda", section: 1, startOffset: 10, dueOffset: 24 },
      { title: "Announce event", section: 2, startOffset: 14, dueOffset: 15 },
      { title: "Event day", section: 3, dueOffset: 45, milestone: true },
    ],
  },
  {
    id: "build",
    name: "Construction or hardware build",
    category: "Planning",
    description: "Sequential phases with dependencies, baselines, and the critical path.",
    workflow: "simple",
    defaultView: "gantt",
    sections: ["Design", "Procurement", "Build", "Test", "Handover"],
    tasks: [
      { title: "Design freeze", section: 0, dueOffset: 14, milestone: true },
      { title: "Order long-lead parts", section: 1, startOffset: 14, dueOffset: 21 },
      { title: "Assembly", section: 2, startOffset: 35, dueOffset: 60 },
      { title: "Acceptance test", section: 3, startOffset: 60, dueOffset: 67 },
      { title: "Handover", section: 4, dueOffset: 70, milestone: true },
    ],
  },
  {
    id: "intake",
    name: "Request intake",
    category: "Operations",
    description: "Requests arrive through a form and move through triage.",
    workflow: "triage",
    defaultView: "table",
    sections: ["Incoming", "Accepted", "Done"],
    tasks: [],
  },
  {
    id: "okr",
    name: "OKR tracker",
    category: "Planning",
    description: "Objectives with key results reviewed each quarter.",
    workflow: "simple",
    defaultView: "list",
    sections: ["Objective 1", "Objective 2", "Objective 3"],
    tasks: [],
  },
  {
    id: "personal",
    name: "Personal to-do",
    category: "Personal",
    description: "Your own list, grouped by when things are due.",
    workflow: "simple",
    defaultView: "list",
    sections: ["Today", "This week", "Later"],
    tasks: [],
  },
];

export function findProjectTemplate(id: string | undefined): ProjectTemplate {
  return projectTemplates.find((t) => t.id === id) ?? projectTemplates[0];
}
