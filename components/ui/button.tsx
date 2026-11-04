"use client";

import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border font-semibold transition-colors duration-100 ease-[var(--ease-standard)] disabled:pointer-events-none disabled:text-fg-disabled select-none",
  {
    variants: {
      variant: {
        primary: "border-transparent bg-brand text-fg-on-brand hover:bg-brand-hover active:bg-brand-pressed disabled:bg-pressed",
        secondary: "border-border-strong bg-surface text-fg hover:bg-hover active:bg-pressed",
        subtle: "border-transparent bg-transparent text-fg hover:bg-hover active:bg-pressed",
        danger: "border-transparent bg-danger text-fg-on-brand hover:opacity-90 active:opacity-80",
        link: "border-transparent bg-transparent text-brand hover:underline font-normal px-0",
      },
      size: {
        md: "h-8 px-3 type-body-1 font-semibold",
        sm: "h-6 px-2 type-caption-1-strong",
        lg: "h-10 px-5 type-body-1 font-semibold",
        icon: "h-8 w-8 p-0",
        "icon-sm": "h-6 w-6 p-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, children, disabled, ...props },
  ref,
) {
  if (asChild) {
    return (
      <Slot.Root ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
      {children}
    </button>
  );
});

export { buttonVariants };
