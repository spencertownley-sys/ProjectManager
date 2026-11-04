"use client";

import * as React from "react";
import { DropdownMenu as Dd, ContextMenu as Cm } from "radix-ui";
import { Checkmark16Regular, ChevronRight16Regular } from "@fluentui/react-icons";
import { cn } from "@/lib/utils";

const contentClass =
  "z-50 min-w-48 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-surface-raised p-1 shadow-menu data-[state=open]:animate-in data-[state=closed]:animate-out";
const itemClass =
  "relative flex h-8 cursor-default select-none items-center gap-2 rounded-sm px-2 type-body-1 text-fg outline-none data-[highlighted]:bg-hover data-[disabled]:text-fg-disabled data-[state=checked]:bg-selected";

export const Menu = Dd.Root;
export const MenuTrigger = Dd.Trigger;
export const MenuGroup = Dd.Group;
export const MenuSub = Dd.Sub;
export const MenuRadioGroup = Dd.RadioGroup;

export function MenuContent({ className, align = "start", ...props }: React.ComponentProps<typeof Dd.Content>) {
  return (
    <Dd.Portal>
      <Dd.Content sideOffset={4} align={align} className={cn(contentClass, className)} {...props} />
    </Dd.Portal>
  );
}

export function MenuItem({ className, icon, shortcut, children, destructive, asChild, ...props }: React.ComponentProps<typeof Dd.Item> & { icon?: React.ReactNode; shortcut?: string; destructive?: boolean }) {
  if (asChild) {
    return (
      <Dd.Item asChild className={cn(itemClass, destructive && "text-danger data-[highlighted]:bg-danger-tint", className)} {...props}>
        {children}
      </Dd.Item>
    );
  }
  return (
    <Dd.Item className={cn(itemClass, destructive && "text-danger data-[highlighted]:bg-danger-tint", className)} {...props}>
      {icon ? <span className="inline-flex w-4 shrink-0 items-center justify-center text-fg-secondary">{icon}</span> : null}
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? <span className="ml-4 type-caption-1 text-fg-tertiary">{shortcut}</span> : null}
    </Dd.Item>
  );
}

export function MenuCheckboxItem({ className, children, ...props }: React.ComponentProps<typeof Dd.CheckboxItem>) {
  return (
    <Dd.CheckboxItem className={cn(itemClass, "pl-7", className)} {...props}>
      <Dd.ItemIndicator className="absolute left-2 inline-flex items-center">
        <Checkmark16Regular />
      </Dd.ItemIndicator>
      {children}
    </Dd.CheckboxItem>
  );
}

export function MenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof Dd.RadioItem>) {
  return (
    <Dd.RadioItem className={cn(itemClass, "pl-7", className)} {...props}>
      <Dd.ItemIndicator className="absolute left-2 inline-flex items-center">
        <Checkmark16Regular />
      </Dd.ItemIndicator>
      {children}
    </Dd.RadioItem>
  );
}

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof Dd.Label>) {
  return <Dd.Label className={cn("px-2 py-1.5 type-caption-1-strong text-fg-tertiary", className)} {...props} />;
}

export function MenuSeparator({ className, ...props }: React.ComponentProps<typeof Dd.Separator>) {
  return <Dd.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}

export function MenuSubTrigger({ className, children, ...props }: React.ComponentProps<typeof Dd.SubTrigger>) {
  return (
    <Dd.SubTrigger className={cn(itemClass, className)} {...props}>
      <span className="flex-1">{children}</span>
      <ChevronRight16Regular className="text-fg-tertiary" />
    </Dd.SubTrigger>
  );
}

export function MenuSubContent({ className, ...props }: React.ComponentProps<typeof Dd.SubContent>) {
  return (
    <Dd.Portal>
      <Dd.SubContent sideOffset={2} className={cn(contentClass, className)} {...props} />
    </Dd.Portal>
  );
}

// Context menu variants share the same look.
export const ContextMenu = Cm.Root;
export const ContextMenuTrigger = Cm.Trigger;
export function ContextMenuContent({ className, ...props }: React.ComponentProps<typeof Cm.Content>) {
  return (
    <Cm.Portal>
      <Cm.Content className={cn(contentClass, className)} {...props} />
    </Cm.Portal>
  );
}
export function ContextMenuItem({ className, icon, shortcut, children, destructive, ...props }: React.ComponentProps<typeof Cm.Item> & { icon?: React.ReactNode; shortcut?: string; destructive?: boolean }) {
  return (
    <Cm.Item className={cn(itemClass, destructive && "text-danger data-[highlighted]:bg-danger-tint", className)} {...props}>
      {icon ? <span className="inline-flex w-4 shrink-0 items-center justify-center text-fg-secondary">{icon}</span> : null}
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? <span className="ml-4 type-caption-1 text-fg-tertiary">{shortcut}</span> : null}
    </Cm.Item>
  );
}
export function ContextMenuSeparator({ className, ...props }: React.ComponentProps<typeof Cm.Separator>) {
  return <Cm.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}
