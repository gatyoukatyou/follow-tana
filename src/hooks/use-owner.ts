import { useSyncExternalStore } from "react";
import { getOwnerHandle, subscribeOwner } from "@/lib/owner";

export function useOwnerHandle(): string {
  return useSyncExternalStore(subscribeOwner, getOwnerHandle, () => "");
}
