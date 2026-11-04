"use client";

import * as React from "react";
import { Switch as RadixSwitch } from "radix-ui";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof RadixSwitch.Root>) {
  return (
    <RadixSwitch.Root
      className={cn("relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border-strong bg-surface transition-colors data-[state=checked]:border-brand data-[state=checked]:bg-brand disabled:cursor-not-allowed disabled:opacity-50", className)}
      {...props}
    >
      <RadixSwitch.Thumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-fg-secondary transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-fg-on-brand" />
    </RadixSwitch.Root>
  );
}
