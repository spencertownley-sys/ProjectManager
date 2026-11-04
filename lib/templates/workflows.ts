import type { StatusCategory } from "@/lib/db/schema";
import type { PaletteColor } from "@/lib/validation/common";

export type WorkflowTemplateKey = "simple" | "kanban" | "scrum" | "shape_up" | "phase_gate" | "triage";

export type StatusTemplate = { name: string; category: StatusCategory; color: PaletteColor; wipLimit?: number };

export const workflowTemplates: Record<WorkflowTemplateKey, { name: string; statuses: StatusTemplate[] }> = {
  simple: {
    name: "Simple",
    statuses: [
      { name: "To do", category: "not_started", color: "gray" },
      { name: "In progress", category: "in_progress", color: "blue" },
      { name: "Done", category: "done", color: "green" },
    ],
  },
  kanban: {
    name: "Kanban",
    statuses: [
      { name: "Backlog", category: "backlog", color: "gray" },
      { name: "Ready", category: "not_started", color: "navy" },
      { name: "In progress", category: "in_progress", color: "blue", wipLimit: 5 },
      { name: "Review", category: "in_progress", color: "purple", wipLimit: 3 },
      { name: "Done", category: "done", color: "green" },
    ],
  },
  scrum: {
    name: "Scrum",
    statuses: [
      { name: "Backlog", category: "backlog", color: "gray" },
      { name: "Selected", category: "not_started", color: "navy" },
      { name: "In progress", category: "in_progress", color: "blue" },
      { name: "In review", category: "in_progress", color: "purple" },
      { name: "Done", category: "done", color: "green" },
    ],
  },
  shape_up: {
    name: "Shape Up",
    statuses: [
      { name: "Pitch", category: "backlog", color: "gray" },
      { name: "Bet", category: "not_started", color: "navy" },
      { name: "Building", category: "in_progress", color: "blue" },
      { name: "Shipped", category: "done", color: "green" },
    ],
  },
  phase_gate: {
    name: "Phase-gate",
    statuses: [
      { name: "Proposed", category: "not_started", color: "gray" },
      { name: "Approved", category: "not_started", color: "navy" },
      { name: "In progress", category: "in_progress", color: "blue" },
      { name: "In review", category: "in_progress", color: "purple" },
      { name: "Complete", category: "done", color: "green" },
      { name: "Declined", category: "done", color: "red" },
    ],
  },
  triage: {
    name: "Triage",
    statuses: [
      { name: "New", category: "backlog", color: "gray" },
      { name: "Accepted", category: "not_started", color: "navy" },
      { name: "In progress", category: "in_progress", color: "blue" },
      { name: "Done", category: "done", color: "green" },
      { name: "Declined", category: "done", color: "red" },
    ],
  },
};
