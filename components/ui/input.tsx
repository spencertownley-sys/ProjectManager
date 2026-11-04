"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-8 w-full rounded-sm border border-border-strong bg-surface px-2 type-body-1 text-fg placeholder:text-fg-tertiary focus:border-brand focus:outline-none focus-visible:outline-none disabled:bg-subtle disabled:text-fg-disabled read-only:bg-subtle",
        invalid && "border-danger",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-20 w-full rounded-sm border border-border-strong bg-surface px-2 py-1.5 type-body-1 text-fg placeholder:text-fg-tertiary focus:border-brand focus:outline-none",
        className,
      )}
      {...props}
    />
  );
});

/** Borderless until focus; used inside tables, lists, and the task pane. */
export const InlineInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function InlineInput(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-7 w-full rounded-sm border border-transparent bg-transparent px-1.5 type-body-1 text-fg placeholder:text-fg-tertiary hover:border-border focus:border-brand focus:bg-surface focus:outline-none",
        className,
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("type-caption-1-strong text-fg-secondary", className)} {...props} />;
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label>{label}</Label>
      {children}
      {error ? <p className="type-caption-1 text-danger">{error}</p> : hint ? <p className="type-caption-1 text-fg-tertiary">{hint}</p> : null}
    </div>
  );
}
