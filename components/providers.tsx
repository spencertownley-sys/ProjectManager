"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { WorkspaceProvider, type WorkspaceContextValue } from "@/lib/client/workspace-context";

export function AppProviders({ workspace, children }: { workspace: WorkspaceContextValue; children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: 1 }, mutations: { retry: 0 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <WorkspaceProvider value={workspace}>
        <TooltipProvider delayDuration={300}>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </WorkspaceProvider>
    </QueryClientProvider>
  );
}
