import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const variants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-maroon disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-maroon text-cream hover:bg-[#611723]",
        outline:
          "border border-[#d5bba0] bg-transparent text-maroon hover:bg-[#f3e5d3]",
        ghost: "text-maroon hover:bg-[#f3e5d3]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
export function Button({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof variants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(variants({ variant, className }))} {...props} />;
}
