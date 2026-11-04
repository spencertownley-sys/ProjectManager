"use client";

import { useQuery, useQueryClient, useMutation, type QueryClient } from "@tanstack/react-query";
import * as React from "react";
import type { TaskRow, DependencyRow } from "@/lib/query-engine/types";
import type { ViewSpec } from "@/lib/validation/view-spec";
import type { UpdateTaskInput, CreateTaskInput, MoveTaskInput } from "@/lib/validation/task";
import { queryProjectTasksAction, queryMyWorkAction, updateTaskAction, createTaskAction, moveTaskAction, deleteTaskAction, restoreTaskAction, getTaskDetailAction, bulkUpdateTasksAction } from "@/lib/actions/tasks";
import type { TaskDetail } from "@/lib/services/tasks";
import { getBaselineAction } from "@/lib/actions/projects";
import type { BaselineTasks } from "@/lib/services/projects";
import { useWorkspace } from "./workspace-context";
import { useToast } from "@/components/ui/toast";

export type ProjectTasksData = { rows: TaskRow[]; total: number; truncated: boolean; dependencies: DependencyRow[] };
export type MyWorkData = { rows: TaskRow[]; total: number; truncated: boolean };

export const keys = {
  projectTasks: (slug: string, projectId: string, spec: ViewSpec) => ["tasks", slug, "project", projectId, spec] as const,
  projectTasksAll: (slug: string, projectId: string) => ["tasks", slug, "project", projectId] as const,
  myWork: (slug: string, spec: ViewSpec, mode: string) => ["tasks", slug, "my-work", mode, spec] as const,
  allTasks: (slug: string) => ["tasks", slug] as const,
  taskDetail: (slug: string, id: string) => ["task", slug, id] as const,
  baseline: (slug: string, id: string) => ["baseline", slug, id] as const,
};

/** The dates a saved Gantt baseline captured. Fixture baselines carry their tasks inline and skip the server. */
export function useBaseline(baseline: { id: string; tasks?: BaselineTasks } | null) {
  const { slug } = useWorkspace();
  return useQuery({
    queryKey: keys.baseline(slug, baseline?.id ?? ""),
    queryFn: async () => {
      if (baseline?.tasks) return baseline.tasks;
      const res = await getBaselineAction(slug, baseline!.id);
      if (!res.ok) throw new Error(res.error.message);
      return res.data.tasks;
    },
    enabled: Boolean(baseline),
    staleTime: 60_000,
  });
}

/**
 * Tasks for a project view. `staticData` (the dev preview) answers every spec with the same rows instead of
 * calling the server, so grouping and view options can be exercised without a database.
 */
export function useProjectTasks(projectId: string, spec: ViewSpec, initialData?: ProjectTasksData, staticData?: ProjectTasksData) {
  const { slug, today } = useWorkspace();
  return useQuery({
    queryKey: keys.projectTasks(slug, projectId, spec),
    queryFn: async () => {
      if (staticData) return staticData;
      const res = await queryProjectTasksAction(slug, projectId, spec, today);
      if (!res.ok) throw new Error(res.error.message);
      return res.data as ProjectTasksData;
    },
    initialData: staticData ?? initialData,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useMyWork(spec: ViewSpec, mode: "assigned" | "created" | "following", initialData?: MyWorkData) {
  const { slug, today } = useWorkspace();
  return useQuery({
    queryKey: keys.myWork(slug, spec, mode),
    queryFn: async () => {
      const res = await queryMyWorkAction(slug, spec, today, mode);
      if (!res.ok) throw new Error(res.error.message);
      return res.data as MyWorkData;
    },
    initialData,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useTaskDetail(idOrKey: string | null) {
  const { slug, today } = useWorkspace();
  return useQuery({
    queryKey: keys.taskDetail(slug, idOrKey ?? ""),
    queryFn: async () => {
      const res = await getTaskDetailAction(slug, idOrKey as string, today);
      if (!res.ok) throw new Error(res.error.message);
      return res.data as TaskDetail;
    },
    enabled: Boolean(idOrKey),
    staleTime: 5_000,
  });
}

/** Applies a patch to every cached task list that contains the task. */
function patchCachedTask(client: QueryClient, slug: string, taskId: string, patch: (row: TaskRow) => TaskRow) {
  client.setQueriesData<{ rows: TaskRow[] }>({ queryKey: keys.allTasks(slug) }, (old) => {
    if (!old || !Array.isArray(old.rows)) return old;
    let touched = false;
    const rows = old.rows.map((r) => {
      if (r.id !== taskId) return r;
      touched = true;
      return patch(r);
    });
    return touched ? { ...old, rows } : old;
  });
  client.setQueriesData<TaskDetail>({ queryKey: ["task", slug, taskId] }, (old) => (old ? { ...old, task: patch(old.task) } : old));
}

export function useTaskMutations() {
  const client = useQueryClient();
  const { slug } = useWorkspace();
  const { toast } = useToast();

  const invalidate = React.useCallback(() => client.invalidateQueries({ queryKey: keys.allTasks(slug) }), [client, slug]);

  const update = useMutation({
    mutationFn: async (input: UpdateTaskInput & { optimistic?: (row: TaskRow) => TaskRow }) => {
      const { optimistic, ...rest } = input;
      void optimistic;
      const res = await updateTaskAction(slug, rest);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: keys.allTasks(slug) });
      const snapshot = client.getQueriesData({ queryKey: keys.allTasks(slug) });
      if (input.optimistic) patchCachedTask(client, slug, input.id, input.optimistic);
      return { snapshot };
    },
    onError: (error, _input, context) => {
      context?.snapshot.forEach(([key, data]) => client.setQueryData(key, data));
      toast({ title: "Could not save the change", description: error.message, kind: "danger" });
    },
    onSettled: () => invalidate(),
  });

  const create = useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const res = await createTaskAction(slug, input);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    onError: (error) => toast({ title: "Could not create the task", description: error.message, kind: "danger" }),
    onSettled: () => invalidate(),
  });

  const move = useMutation({
    mutationFn: async (input: MoveTaskInput & { optimistic?: (row: TaskRow) => TaskRow }) => {
      const { optimistic, ...rest } = input;
      void optimistic;
      const res = await moveTaskAction(slug, rest);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: keys.allTasks(slug) });
      const snapshot = client.getQueriesData({ queryKey: keys.allTasks(slug) });
      if (input.optimistic) patchCachedTask(client, slug, input.id, input.optimistic);
      return { snapshot };
    },
    onError: (error, _input, context) => {
      context?.snapshot.forEach(([key, data]) => client.setQueryData(key, data));
      toast({ title: "Could not move the task", description: error.message, kind: "danger" });
    },
    onSettled: () => invalidate(),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteTaskAction(slug, id);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: keys.allTasks(slug) });
      const snapshot = client.getQueriesData({ queryKey: keys.allTasks(slug) });
      client.setQueriesData<{ rows: TaskRow[] }>({ queryKey: keys.allTasks(slug) }, (old) => (old && Array.isArray(old.rows) ? { ...old, rows: old.rows.filter((r) => r.id !== id && r.parentId !== id) } : old));
      return { snapshot };
    },
    onSuccess: (_data, id) => {
      toast({
        title: "Task deleted",
        kind: "info",
        action: {
          label: "Undo",
          onClick: async () => {
            await restoreTaskAction(slug, id);
            invalidate();
          },
        },
      });
    },
    onError: (error, _id, context) => {
      context?.snapshot.forEach(([key, data]) => client.setQueryData(key, data));
      toast({ title: "Could not delete the task", description: error.message, kind: "danger" });
    },
    onSettled: () => invalidate(),
  });

  /** Applies one patch to many tasks (fill handle, paste) with the same optimistic update per task. */
  const bulk = useMutation({
    mutationFn: async (input: { ids: string[]; patch: Record<string, unknown>; optimistic?: (row: TaskRow) => TaskRow }) => {
      const res = await bulkUpdateTasksAction(slug, { ids: input.ids, patch: input.patch });
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: keys.allTasks(slug) });
      const snapshot = client.getQueriesData({ queryKey: keys.allTasks(slug) });
      if (input.optimistic) for (const id of input.ids) patchCachedTask(client, slug, id, input.optimistic);
      return { snapshot };
    },
    onError: (error, _input, context) => {
      context?.snapshot.forEach(([key, data]) => client.setQueryData(key, data));
      toast({ title: "Could not update the tasks", description: error.message, kind: "danger" });
    },
    onSettled: () => invalidate(),
  });

  return { update, create, move, remove, bulk, invalidate };
}
