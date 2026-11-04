"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Inline composer used by every view. Enter creates, Shift+Enter creates and keeps the composer open, Escape cancels. */
export function QuickAddRow({ onSubmit, onCancel, autoFocus, placeholder = "Task title", className }: { onSubmit: (title: string) => void; onCancel: () => void; autoFocus?: boolean; placeholder?: string; className?: string }) {
  const [value, setValue] = React.useState("");
  const submit = (keepOpen: boolean) => {
    const v = value.trim();
    if (!v) {
      onCancel();
      return;
    }
    onSubmit(v);
    setValue("");
    if (!keepOpen) onCancel();
  };
  return (
    <div className={cn("flex h-full w-full items-center", className)}>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="New task title"
        className="h-7 w-full rounded-sm border border-brand bg-surface px-1.5 type-body-1 outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit(e.shiftKey);
          }
          if (e.key === "Escape") onCancel();
        }}
        onBlur={() => submit(false)}
      />
    </div>
  );
}
