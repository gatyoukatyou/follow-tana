import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
      const repaired = useRoster.getState().repairMassFalseDead();
      enableRosterPersist();
      setHydrated(true);
      if (repaired > 0) {
        toast.message(
          `${repaired.toLocaleString("ja-JP")}人は調べ損ねだったので未確認に戻しました。生存確認からXで調べ直してください。`,
          { duration: 12_000 },
        );
      }
      if (!getOwnerHandle()) onNeedOwnerRef.current();
    });
  }, []);

  return hydrated;
}