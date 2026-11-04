"use client";

import * as React from "react";
import { Dialog as RadixDialog } from "radix-ui";
import { Dismiss20Regular } from "@fluentui/react-icons";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

const sizes = { sm: "max-w-[480px]", md: "max-w-[640px]", lg: "max-w-[960px]" } as const;

export function DialogContent({ className, title, description, size = "md", children, footer, ...props }: React.ComponentProps<typeof RadixDialog.Content> & { title: string; description?: string; size?: keyof typeof sizes; footer?: React.ReactNode }) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-fg/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <RadixDialog.Content
        className={cn("fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-border bg-surface-raised shadow-dialog outline-none", sizes[size], className)}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div className="flex flex-col gap-1">
            <RadixDialog.Title className="type-subtitle-1 text-fg">{title}</RadixDialog.Title>
            {description ? <RadixDialog.Description className="type-body-1 text-fg-secondary">{description}</RadixDialog.Description> : <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>}
          </div>
          <RadixDialog.Close asChild>
            <Button variant="subtle" size="icon" aria-label="Close">
              <Dismiss20Regular />
            </Button>
          </RadixDialog.Close>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-border px-6 py-3">{footer}</div> : null}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

/** Right-side sheet, used for the task pane on narrow viewports and for secondary editors. */
export function Sheet({ open, onOpenChange, title, children, className }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: React.ReactNode; className?: string }) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-fg/40" />
        <RadixDialog.Content className={cn("fixed inset-y-0 right-0 z-50 flex w-full max-w-[640px] flex-col border-l border-border bg-surface-raised shadow-dialog outline-none", className)}>
          <RadixDialog.Title className="sr-only">{title}</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
