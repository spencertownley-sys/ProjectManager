"use client";

import * as React from "react";
import { Tabs as RadixTabs } from "radix-ui";
import { cn } from "@/lib/utils";

export const Tabs = RadixTabs.Root;
export const TabsContent = RadixTabs.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof RadixTabs.List>) {
  return <RadixTabs.List className={cn("flex h-10 items-end gap-1 border-b border-border", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "relative -mb-px inline-flex h-10 items-center gap-1.5 border-b-2 border-transparent px-3 type-body-1 text-fg-secondary hover:text-fg data-[state=active]:border-brand data-[state=active]:font-semibold data-[state=active]:text-fg",
        className,
      )}
      {...props}
    />
  );
}

export function PillTabsList({ className, ...props }: React.ComponentProps<typeof RadixTabs.List>) {
  return <RadixTabs.List className={cn("inline-flex h-8 items-center gap-0.5 rounded-sm bg-subtle p-0.5", className)} {...props} />;
}
export function PillTabsTrigger({ className, ...props }: React.ComponentProps<typeof RadixTabs.Trigger>) {
  return <RadixTabs.Trigger className={cn("inline-flex h-7 items-center rounded-xs px-2.5 type-body-1 text-fg-secondary data-[state=active]:bg-surface data-[state=active]:font-semibold data-[state=active]:text-fg", className)} {...props} />;
}
