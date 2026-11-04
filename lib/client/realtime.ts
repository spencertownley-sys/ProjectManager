"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useAuthBridge } from "./auth-bridge";
import { keys } from "./queries";
import { useWorkspace } from "./workspace-context";

let client: SupabaseClient | null = null;

function getRealtimeClient(getToken: () => Promise<string | null>): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!client) client = createClient(url, key, { accessToken: async () => (await getToken()) ?? null });
  return client;
}

/**
 * Subscribes to Postgres changes for one project and refreshes cached queries. The subscription
 * uses the Clerk session token so row-level security limits what the browser receives.
 * Inactive tabs unsubscribe after five minutes and refetch on return (docs/05 section 7).
 */
export function useProjectRealtime(projectId: string | null) {
  const queryClient = useQueryClient();
  const { slug } = useWorkspace();
  const { getToken } = useAuthBridge();

  React.useEffect(() => {
    if (!projectId) return;
    const supabase = getRealtimeClient(getToken);
    if (!supabase) return;
    let timer: number | undefined;
    let channel = supabase.channel(`project:${projectId}`);
    const subscribe = () => {
      channel = supabase.channel(`project:${projectId}`);
      const refresh = () => queryClient.invalidateQueries({ queryKey: keys.allTasks(slug) });
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "sections", filter: `project_id=eq.${projectId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, () => queryClient.invalidateQueries({ queryKey: ["task", slug] }))
        .subscribe();
    };
    subscribe();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        timer = window.setTimeout(() => supabase.removeChannel(channel), 5 * 60 * 1000);
      } else {
        if (timer) window.clearTimeout(timer);
        if (channel.state !== "joined") {
          subscribe();
          queryClient.invalidateQueries({ queryKey: keys.allTasks(slug) });
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [projectId, queryClient, slug, getToken]);
}
