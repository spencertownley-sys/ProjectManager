"use client";

import * as React from "react";
import { Tooltip as RadixTooltip } from "radix-ui";
import { cn } from "@/lib/utils";

export const TooltipProvider = RadixTooltip.Provider;

export function Tooltip({ content, children, side = "bottom", shortcut }: { content: React.ReactNode; children: React.ReactElement; side?: "top" | "bottom" | "left" | "right"; shortcut?: string }) {
  return (
    <RadixTooltip.Root delayDuration={300}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className={cn("z-50 flex items-center gap-2 rounded-sm border border-border bg-surface-raised px-2 py-1 type-caption-1 text-fg shadow-menu")}
        >
          {content}
          {shortcut ? <kbd className="rounded-xs bg-subtle px-1 font-sans type-caption-2 text-fg-secondary">{shortcut}</kbd> : null}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
