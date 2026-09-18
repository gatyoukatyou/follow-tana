"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Person } from "@/lib/types";

export function PersonAvatar({
  person,
  size = "md",
}: {
  person: Person;
  size?: "sm" | "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const dim = size === "lg" ? "size-16" : size === "sm" ? "size-9" : "size-11";
  const letter = (person.name || person.handle || "?").trim().slice(0, 1);
  const showImg = person.avatarUrl && !failed;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-sm font-medium text-muted-foreground outline outline-1 -outline-offset-1 outline-white/10",
        dim,
      )}
    >
      {showImg ? (
        <img
          src={person.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden>{letter}</span>
      )}
    </span>
  );
}
