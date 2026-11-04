"use client";

import * as React from "react";
import { Avatar as RadixAvatar } from "radix-ui";
import { cn, initials } from "@/lib/utils";

const sizes = { xs: "h-5 w-5 type-caption-2", sm: "h-6 w-6 type-caption-2", md: "h-8 w-8 type-caption-1", lg: "h-10 w-10 type-body-1" } as const;

export function Avatar({ name, src, size = "sm", className, presence }: { name: string; src?: string | null; size?: keyof typeof sizes; className?: string; presence?: "online" | "away" }) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <RadixAvatar.Root className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-selected font-semibold text-brand", sizes[size])}>
        {src ? <RadixAvatar.Image src={src} alt={name} className="h-full w-full object-cover" /> : null}
        <RadixAvatar.Fallback delayMs={src ? 300 : 0} className="leading-none">
          {initials(name)}
        </RadixAvatar.Fallback>
      </RadixAvatar.Root>
      {presence ? <span className={cn("absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full border border-surface", presence === "online" ? "bg-success" : "bg-warning")} aria-label={presence} /> : null}
    </span>
  );
}

export function AvatarGroup({ people, max = 4, size = "sm" }: { people: Array<{ id: string; displayName: string; avatarUrl?: string | null }>; max?: number; size?: keyof typeof sizes }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((p, i) => (
        <span key={p.id} className={cn("rounded-full ring-2 ring-surface", i > 0 && "-ml-1.5")} title={p.displayName}>
          <Avatar name={p.displayName} src={p.avatarUrl} size={size} />
        </span>
      ))}
      {rest > 0 ? <span className={cn("-ml-1.5 inline-flex items-center justify-center rounded-full bg-hover font-semibold text-fg-secondary ring-2 ring-surface", sizes[size])}>+{rest}</span> : null}
    </span>
  );
}
