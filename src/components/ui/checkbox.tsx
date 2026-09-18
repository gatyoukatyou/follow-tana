"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Checkbox({
  className,
  checked,
  onCheckedChange,
  ...props
}: Omit<ComponentProps<"input">, "type" | "onChange"> & {
  onCheckedChange?: (checked: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      className={cn(
        "size-4 shrink-0 rounded-[4px] border-0 bg-secondary accent-primary shadow-[var(--shadow-border)]",
        className,
      )}
      {...props}
    />
  );
}
