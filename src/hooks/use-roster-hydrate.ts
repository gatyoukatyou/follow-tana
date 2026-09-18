import { useEffect, useRef, useState } from "react";
import { enableRosterPersist } from "@/lib/idb-storage";
import { getOwnerHandle } from "@/lib/owner";
import { useRoster } from "@/lib/roster-store";

export function useRosterHydrate(onNeedOwner: () => void): boolean {
  const [hydrated, setHydrated] = useState(false);
  const onNeedOwnerRef = useRef(onNeedOwner);
  onNeedOwnerRef.current = onNeedOwner;

  useEffect(() => {
    const done = Promise.resolve(useRoster.persist.rehydrate());
    void done.then(() => {
      useRoster.getState().ensureSeeded();
      enableRosterPersist();
      setHydrated(true);
      if (!getOwnerHandle()) onNeedOwnerRef.current();
    });
  }, []);

  return hydrated;
}
