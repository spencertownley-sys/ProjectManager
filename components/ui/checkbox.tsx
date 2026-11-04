"use client";

import * as React from "react";
import { Checkbox as RadixCheckbox } from "radix-ui";
import { Checkmark16Regular, Subtract16Regular } from "@fluentui/react-icons";
import { cn } from "@/lib/utils";

export function Checkbox({ className, round, ...props }: React.ComponentProps<typeof RadixCheckbox.Root> & { round?: boolean }) {
  return (
    <RadixCheckbox.Root
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center border border-border-strong bg-surface text-fg-on-brand transition-colors hover:border-brand data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=indeterminate]:border-brand data-[state=indeterminate]:bg-brand disabled:opacity-50",
        round ? "rounded-full" : "rounded-xs",
        className,
      )}
      {...props}
    >
      <RadixCheckbox.Indicator>{props.checked === "indeterminate" ? <Subtract16Regular className="h-3 w-3" /> : <Checkmark16Regular className="h-3 w-3" />}</RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}
